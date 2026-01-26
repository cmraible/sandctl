package cli

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/sandctl/sandctl/internal/config"
	"github.com/sandctl/sandctl/internal/hetzner"
	"github.com/sandctl/sandctl/internal/provider"
	"github.com/sandctl/sandctl/internal/repo"
	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sshexec"
	"github.com/sandctl/sandctl/internal/ui"
)

var (
	newTimeout  string
	noConsole   bool
	repoFlag    string
	providerArg string
	regionArg   string
	serverType  string
	imageArg    string
)

var newCmd = &cobra.Command{
	Use:   "new",
	Short: "Create a new sandboxed agent session",
	Long: `Create a new sandboxed VM with development tools installed.

The system provisions a VM using the configured provider (default: Hetzner Cloud),
installs development tools (Docker, Git, Node.js, Python), and optionally sets up
OpenCode with your configured Zen key. After provisioning, an interactive console
session is automatically started (unless --no-console is specified or stdin is
not a terminal).`,
	Example: `  # Create a new session and connect automatically
  sandctl new

  # Create with a GitHub repository cloned
  sandctl new -R TryGhost/Ghost

  # Clone from full GitHub URL
  sandctl new --repo https://github.com/facebook/react

  # Create with auto-destroy timeout
  sandctl new --timeout 2h

  # Create without automatic console (for scripts)
  sandctl new --no-console

  # Create in specific region with specific server type
  sandctl new --region hel1 --server-type cpx41`,
	RunE: runNew,
}

func init() {
	newCmd.Flags().StringVarP(&newTimeout, "timeout", "t", "", "auto-destroy after duration (e.g., 1h, 30m)")
	newCmd.Flags().BoolVar(&noConsole, "no-console", false, "skip automatic console connection after provisioning")
	newCmd.Flags().StringVarP(&repoFlag, "repo", "R", "", "GitHub repository to clone (owner/repo or full URL)")
	newCmd.Flags().StringVarP(&providerArg, "provider", "p", "", "provider to use (default: from config)")
	newCmd.Flags().StringVar(&regionArg, "region", "", "datacenter region (overrides config default)")
	newCmd.Flags().StringVar(&serverType, "server-type", "", "server hardware type (overrides config default)")
	newCmd.Flags().StringVar(&imageArg, "image", "", "OS image (overrides config default)")

	rootCmd.AddCommand(newCmd)
}

func runNew(cmd *cobra.Command, args []string) error {
	ctx := context.Background()

	// Load configuration
	cfg, err := loadConfig()
	if err != nil {
		return err
	}

	// Check for legacy config
	if cfg.IsLegacyConfig() {
		return fmt.Errorf("legacy configuration detected\n\n%s", config.MigrationInstructions())
	}

	// Get provider
	providerName := providerArg
	if providerName == "" {
		providerName = cfg.DefaultProvider
	}

	prov, err := getProvider(providerName)
	if err != nil {
		return err
	}

	// Parse repository specification if provided
	var repoSpec *repo.Spec
	if repoFlag != "" {
		repoSpec, err = repo.Parse(repoFlag)
		if err != nil {
			return fmt.Errorf("invalid repository: %w", err)
		}
		verboseLog("Repository: %s -> %s", repoSpec.String(), repoSpec.CloneURL)
	}

	// Parse timeout if provided
	var timeout *session.Duration
	if newTimeout != "" {
		d, parseErr := time.ParseDuration(newTimeout)
		if parseErr != nil {
			return fmt.Errorf("invalid timeout format: %w", parseErr)
		}
		timeout = &session.Duration{Duration: d}
	}

	// Get used names from store to avoid collisions
	store := getSessionStore()
	usedNames, err := store.GetUsedNames()
	if err != nil {
		return fmt.Errorf("failed to get existing sessions: %w", err)
	}

	// Generate session ID (human-readable name)
	sessionID, err := session.GenerateID(usedNames)
	if err != nil {
		return fmt.Errorf("failed to generate session name: %w", err)
	}

	verboseLog("Generated session ID: %s", sessionID)
	verboseLog("Provider: %s", prov.Name())
	verboseLog("Timeout: %v", timeout)

	fmt.Println("Creating new session...")

	// Ensure SSH key is uploaded to provider
	sshKeyID, err := ensureSSHKey(ctx, cfg, prov)
	if err != nil {
		return fmt.Errorf("failed to set up SSH key: %w", err)
	}
	verboseLog("SSH key ID: %s", sshKeyID)

	// Build cloud-init script
	userData := hetzner.CloudInitScript()
	if repoSpec != nil {
		userData = hetzner.CloudInitScriptWithRepo(repoSpec.CloneURL, repoSpec.TargetPath())
	}

	// Create VM
	createOpts := provider.CreateOpts{
		Name:       sessionID,
		SSHKeyID:   sshKeyID,
		Region:     regionArg,
		ServerType: serverType,
		Image:      imageArg,
		UserData:   userData,
	}

	// Create session record (provisioning state)
	sess := session.Session{
		ID:        sessionID,
		Status:    session.StatusProvisioning,
		CreatedAt: time.Now().UTC(),
		Timeout:   timeout,
		Provider:  prov.Name(),
	}

	// Add to local store immediately
	if err := store.Add(sess); err != nil {
		return fmt.Errorf("failed to save session: %w", err)
	}

	// Build provisioning steps
	var vm *provider.VM
	steps := []ui.ProgressStep{
		{
			Message: "Provisioning VM",
			Action: func() error {
				var err error
				vm, err = prov.Create(ctx, createOpts)
				if err != nil {
					return fmt.Errorf("failed to provision VM: %w", err)
				}
				verboseLog("VM created: id=%s, name=%s, ip=%s", vm.ID, vm.Name, vm.IPAddress)
				return nil
			},
		},
		{
			Message: "Waiting for VM to be ready",
			Action: func() error {
				err := prov.WaitReady(ctx, vm.ID, 5*time.Minute)
				if err != nil {
					return fmt.Errorf("VM failed to become ready: %w", err)
				}
				// Refresh VM info to get IP
				vm, err = prov.Get(ctx, vm.ID)
				if err != nil {
					return fmt.Errorf("failed to get VM info: %w", err)
				}
				return nil
			},
		},
	}

	// Wait for cloud-init if repo cloning is requested
	if repoSpec != nil {
		steps = append(steps, ui.ProgressStep{
			Message: "Waiting for setup to complete",
			Action: func() error {
				return waitForCloudInit(vm.IPAddress, 3*time.Minute)
			},
		})
	}

	// Add OpenCode setup if configured
	if cfg.OpencodeZenKey != "" {
		steps = append(steps, ui.ProgressStep{
			Message: "Setting up OpenCode",
			Action: func() error {
				return setupOpenCodeViaSSH(vm.IPAddress, cfg)
			},
		})
	}

	provisionErr := ui.RunSteps(os.Stdout, steps)

	if provisionErr != nil {
		// Cleanup on failure
		cleanupFailedSession(ctx, prov, store, sessionID, vm)
		return provisionErr
	}

	// Update session with provider info
	sess.Status = session.StatusRunning
	sess.ProviderID = vm.ID
	sess.IPAddress = vm.IPAddress
	if err := store.UpdateSession(sess); err != nil {
		verboseLog("Warning: failed to update session: %v", err)
	}

	// Print success message with session name
	fmt.Println()
	fmt.Printf("Session created: %s\n", sessionID)
	fmt.Printf("IP address: %s\n", vm.IPAddress)

	// Determine if we should start console automatically
	isInteractive := term.IsTerminal(int(os.Stdin.Fd()))
	shouldStartConsole := !noConsole && isInteractive

	if shouldStartConsole {
		fmt.Println("Connecting to console...")
		if repoSpec != nil {
			fmt.Printf("Repository cloned to: %s\n", repoSpec.TargetPath())
		}
		fmt.Println()

		// Start SSH console
		consoleErr := startSSHConsole(vm.IPAddress)
		if consoleErr != nil {
			fmt.Fprintln(os.Stderr)
			fmt.Fprintf(os.Stderr, "Warning: Failed to connect to console: %v\n", consoleErr)
			fmt.Fprintln(os.Stderr)
			fmt.Fprintf(os.Stderr, "Session was created successfully. Use 'sandctl console %s' to connect manually.\n", sessionID)
		}
	} else {
		fmt.Println()
		fmt.Printf("Use 'sandctl console %s' to connect.\n", sessionID)
		fmt.Printf("Use 'sandctl destroy %s' when done.\n", sessionID)
	}

	return nil
}

// ensureSSHKey makes sure the user's SSH key is uploaded to the provider.
func ensureSSHKey(ctx context.Context, cfg *config.Config, prov provider.Provider) (string, error) {
	// Check if provider supports SSH key management
	keyManager, ok := prov.(provider.SSHKeyManager)
	if !ok {
		return "", fmt.Errorf("provider %s does not support SSH key management", prov.Name())
	}

	// Read public key
	pubKeyPath := cfg.ExpandSSHPublicKeyPath()
	pubKeyData, err := os.ReadFile(pubKeyPath)
	if err != nil {
		return "", fmt.Errorf("failed to read SSH public key: %w", err)
	}

	// Generate a name for the key based on content hash
	keyName := fmt.Sprintf("sandctl-%s", hashPrefix(string(pubKeyData), 8))

	// Ensure key exists in provider
	keyID, err := keyManager.EnsureSSHKey(ctx, keyName, string(pubKeyData))
	if err != nil {
		return "", err
	}

	return keyID, nil
}

// hashPrefix returns a prefix of the hash of the input string.
func hashPrefix(s string, n int) string {
	// Simple hash - just use first n chars of MD5 hex
	h := fmt.Sprintf("%x", s)
	if len(h) > n {
		return h[:n]
	}
	return h
}

// setupOpenCodeViaSSH installs and configures OpenCode via SSH.
func setupOpenCodeViaSSH(ipAddress string, cfg *config.Config) error {
	privateKeyPath, err := getSSHPrivateKeyPath()
	if err != nil {
		return err
	}

	client, err := sshexec.NewClient(ipAddress, privateKeyPath)
	if err != nil {
		return fmt.Errorf("failed to create SSH client: %w", err)
	}
	defer client.Close()

	// Install OpenCode
	installCmd := "curl -fsSL https://opencode.ai/install | bash"
	_, err = client.Exec(installCmd)
	if err != nil {
		verboseLog("Warning: OpenCode installation failed: %v", err)
		return nil // Non-fatal
	}

	// Create config directory
	_, _ = client.Exec("mkdir -p ~/.local/share/opencode")

	// Write auth file
	authJSON := fmt.Sprintf(`{"opencode":{"type":"api","key":"%s"}}`, cfg.OpencodeZenKey)
	writeCmd := fmt.Sprintf("echo '%s' > ~/.local/share/opencode/auth.json", authJSON)
	_, err = client.Exec(writeCmd)
	if err != nil {
		verboseLog("Warning: Failed to write OpenCode auth: %v", err)
	}

	return nil
}

// waitForCloudInit waits for cloud-init to complete by polling for the boot-finished file.
func waitForCloudInit(ipAddress string, timeout time.Duration) error {
	privateKeyPath, err := getSSHPrivateKeyPath()
	if err != nil {
		return err
	}

	client, err := sshexec.NewClient(ipAddress, privateKeyPath)
	if err != nil {
		return fmt.Errorf("failed to create SSH client: %w", err)
	}
	defer client.Close()

	deadline := time.Now().Add(timeout)
	pollInterval := 5 * time.Second

	for time.Now().Before(deadline) {
		// Check if cloud-init has finished
		output, err := client.Exec("test -f /var/lib/cloud/instance/boot-finished && echo done")
		if err == nil && output == "done\n" {
			return nil
		}
		time.Sleep(pollInterval)
	}

	return fmt.Errorf("cloud-init did not complete within %v", timeout)
}

// cleanupFailedSession removes a session that failed to provision.
func cleanupFailedSession(ctx context.Context, prov provider.Provider, store *session.Store, sessionID string, vm *provider.VM) {
	verboseLog("Cleaning up failed session: %s", sessionID)

	// Try to delete the VM if it was created
	if vm != nil && vm.ID != "" {
		_ = prov.Delete(ctx, vm.ID)
	}

	// Update local store to failed status
	_ = store.Update(sessionID, session.StatusFailed)
}

// startSSHConsole opens an interactive SSH console to the VM.
func startSSHConsole(ipAddress string) error {
	privateKeyPath, err := getSSHPrivateKeyPath()
	if err != nil {
		return err
	}

	client, err := sshexec.NewClient(ipAddress, privateKeyPath)
	if err != nil {
		return fmt.Errorf("failed to create SSH client: %w", err)
	}
	defer client.Close()

	return client.Console(sshexec.ConsoleOptions{})
}
