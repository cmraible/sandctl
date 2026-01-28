package cli

import (
	"context"
	"crypto/md5" //nolint:gosec // Used for unique naming, not security
	"encoding/base64"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/sandctl/sandctl/internal/config"
	"github.com/sandctl/sandctl/internal/hetzner"
	"github.com/sandctl/sandctl/internal/provider"
	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sshexec"
	"github.com/sandctl/sandctl/internal/templateconfig"
	"github.com/sandctl/sandctl/internal/ui"
)

var (
	newTimeout   string
	noConsole    bool
	templateFlag string
	providerArg  string
	regionArg    string
	serverType   string
	imageArg     string
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

  # Create with a template
  sandctl new -T Ghost

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
	newCmd.Flags().StringVarP(&templateFlag, "template", "T", "", "template to use for initialization")
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

	// Look up template if provided
	var tmplConfig *templateconfig.TemplateConfig
	if templateFlag != "" {
		store := getTemplateStore()
		tmplConfig, err = store.Get(templateFlag)
		if err != nil {
			if _, ok := err.(*templateconfig.NotFoundError); ok {
				return fmt.Errorf("template '%s' not found. Use 'sandctl template list' to see available templates", templateFlag)
			}
			return fmt.Errorf("failed to load template: %w", err)
		}
		verboseLog("Template: %s (normalized: %s)", tmplConfig.OriginalName, tmplConfig.Template)
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

	// Wait for cloud-init to complete (creates agent user with SSH access)
	steps = append(steps, ui.ProgressStep{
		Message: "Waiting for setup to complete",
		Action: func() error {
			return waitForCloudInit(vm.IPAddress, 10*time.Minute)
		},
	})

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

	// Set up Git configuration in the VM (if configured during init)
	if cfg.GitConfigMethod != "" && cfg.GitConfigMethod != "skip" {
		gitContent, err := decodeGitConfig(cfg.GitConfigContent)
		if err != nil {
			verboseLog("Warning: failed to decode Git config: %v", err)
		} else if len(gitContent) > 0 {
			// Transfer the Git config to the VM
			client, err := createSSHClient(vm.IPAddress)
			if err != nil {
				verboseLog("Warning: failed to connect for Git config transfer: %v", err)
			} else {
				defer client.Close()
				if err := transferGitConfig(client, gitContent, "agent"); err != nil {
					// Non-fatal error per FR-021
					verboseLog("Warning: failed to transfer Git config: %v", err)
				}
			}
		}
	}

	// Check for and run custom init script for the template
	var initScriptFailed bool
	if tmplConfig != nil {
		tmplStore := getTemplateStore()
		if initScript, err := tmplStore.GetInitScript(tmplConfig.Template); err == nil && initScript != "" {
			fmt.Println()
			fmt.Println("Running template init script...")
			initErr := runTemplateInitScript(vm.IPAddress, tmplConfig, initScript)
			if initErr != nil {
				initScriptFailed = true
				fmt.Fprintln(os.Stderr)
				fmt.Fprintf(os.Stderr, "Init script failed: %v\n", initErr)
				fmt.Fprintln(os.Stderr)
				fmt.Fprintf(os.Stderr, "Session is available for debugging. Use 'sandctl console %s' to connect.\n", sessionID)
				fmt.Fprintf(os.Stderr, "Use 'sandctl destroy %s' when done.\n", sessionID)
			} else {
				fmt.Println("Init script completed successfully.")
			}
		}
	}

	// Update session with provider info
	sess.Status = session.StatusRunning
	sess.ProviderID = vm.ID
	sess.IPAddress = vm.IPAddress
	if err := store.UpdateSession(sess); err != nil {
		verboseLog("Warning: failed to update session: %v", err)
	}

	// If init script failed, we've already printed the message - exit without console
	if initScriptFailed {
		return fmt.Errorf("init script failed")
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

	// Get public key (from agent or file)
	pubKeyData, err := cfg.GetSSHPublicKey()
	if err != nil {
		return "", fmt.Errorf("failed to get SSH public key: %w", err)
	}

	// Generate a name for the key based on content hash
	keyName := fmt.Sprintf("sandctl-%s", hashPrefix(pubKeyData, 8))

	// Ensure key exists in provider
	keyID, err := keyManager.EnsureSSHKey(ctx, keyName, pubKeyData)
	if err != nil {
		return "", err
	}

	return keyID, nil
}

// hashPrefix returns a prefix of the MD5 hash of the input string.
func hashPrefix(s string, n int) string {
	h := md5.Sum([]byte(s)) //nolint:gosec // Not used for security, just for unique naming
	hexStr := fmt.Sprintf("%x", h)
	if len(hexStr) > n {
		return hexStr[:n]
	}
	return hexStr
}

// setupOpenCodeViaSSH installs and configures OpenCode via SSH.
func setupOpenCodeViaSSH(ipAddress string, cfg *config.Config) error {
	client, err := createSSHClient(ipAddress)
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
	client, err := createSSHClient(ipAddress)
	if err != nil {
		return fmt.Errorf("failed to create SSH client: %w", err)
	}
	defer client.Close()

	deadline := time.Now().Add(timeout)
	pollInterval := 5 * time.Second

	for time.Now().Before(deadline) {
		// Check if cloud-init has finished
		output, err := client.Exec("test -f /var/lib/cloud/instance/boot-finished && echo done")
		if err != nil {
			verboseLog("cloud-init check failed: %v", err)
		} else {
			verboseLog("cloud-init check output: %q", output)
		}
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
	client, err := createSSHClient(ipAddress)
	if err != nil {
		return fmt.Errorf("failed to create SSH client: %w", err)
	}
	defer client.Close()

	return client.Console(sshexec.ConsoleOptions{})
}

// runTemplateInitScript uploads and executes a custom init script on the VM.
// The script runs from the home directory with template info passed as environment variables.
func runTemplateInitScript(ipAddress string, tmplConfig *templateconfig.TemplateConfig, scriptContent string) error {
	client, err := createSSHClient(ipAddress)
	if err != nil {
		return fmt.Errorf("failed to create SSH client: %w", err)
	}
	defer client.Close()

	// Upload the script using base64 encoding to handle special characters
	encoded := base64.StdEncoding.EncodeToString([]byte(scriptContent))
	uploadCmd := fmt.Sprintf("echo '%s' | base64 -d > /tmp/sandctl-init.sh && chmod +x /tmp/sandctl-init.sh", encoded)
	_, err = client.Exec(uploadCmd)
	if err != nil {
		return fmt.Errorf("failed to upload init script: %w", err)
	}

	// Execute the script with template info as environment variables
	execCmd := fmt.Sprintf(
		"SANDCTL_TEMPLATE_NAME=%q SANDCTL_TEMPLATE_NORMALIZED=%q /tmp/sandctl-init.sh",
		tmplConfig.OriginalName,
		tmplConfig.Template,
	)
	err = client.ExecWithStreams(execCmd, nil, os.Stdout, os.Stderr)
	if err != nil {
		return fmt.Errorf("script execution failed: %w", err)
	}

	// Clean up the temp script
	_, _ = client.Exec("rm -f /tmp/sandctl-init.sh")

	return nil
}
