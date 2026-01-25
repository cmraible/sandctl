package cli

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/sandctl/sandctl/internal/repo"
	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sprites"
	"github.com/sandctl/sandctl/internal/ui"
)

var (
	newTimeout string
	noConsole  bool
	repoFlag   string
)

var newCmd = &cobra.Command{
	Use:   "new",
	Short: "Create a new sandboxed agent session",
	Long: `Create a new sandboxed VM with development tools and OpenCode installed.

The system provisions a Fly.io Sprite, installs development tools, and sets up
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
  sandctl new --no-console`,
	RunE: runNew,
}

func init() {
	newCmd.Flags().StringVarP(&newTimeout, "timeout", "t", "", "auto-destroy after duration (e.g., 1h, 30m)")
	newCmd.Flags().BoolVar(&noConsole, "no-console", false, "skip automatic console connection after provisioning")
	newCmd.Flags().StringVarP(&repoFlag, "repo", "R", "", "GitHub repository to clone (owner/repo or full URL)")

	rootCmd.AddCommand(newCmd)
}

func runNew(cmd *cobra.Command, args []string) error {
	// Load configuration
	cfg, err := loadConfig()
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
	verboseLog("Timeout: %v", timeout)

	// Create sprites client
	client := sprites.NewClient(cfg.SpritesToken)

	fmt.Println("Creating new session...")

	// Create session record (provisioning state)
	sess := session.Session{
		ID:        sessionID,
		Status:    session.StatusProvisioning,
		CreatedAt: time.Now().UTC(),
		Timeout:   timeout,
	}

	// Add to local store immediately
	if err := store.Add(sess); err != nil {
		return fmt.Errorf("failed to save session: %w", err)
	}

	// Build provisioning steps
	steps := []ui.ProgressStep{
		{
			Message: "Provisioning VM",
			Action: func() error {
				return provisionSprite(client, sessionID)
			},
		},
		{
			Message: "Installing development tools",
			Action: func() error {
				return installDevTools(client, sessionID)
			},
		},
	}

	// Add clone step if repository specified
	if repoSpec != nil {
		steps = append(steps, ui.ProgressStep{
			Message: "Cloning repository",
			Action: func() error {
				return cloneRepository(client, sessionID, repoSpec)
			},
		})
	}

	// Add OpenCode installation steps
	steps = append(steps,
		ui.ProgressStep{
			Message: "Installing OpenCode",
			Action: func() error {
				return installOpenCode(client, sessionID)
			},
		},
		ui.ProgressStep{
			Message: "Setting up OpenCode authentication",
			Action: func() error {
				return setupOpenCodeAuth(client, sessionID, cfg.OpencodeZenKey)
			},
		},
	)

	provisionErr := ui.RunSteps(os.Stdout, steps)

	if provisionErr != nil {
		// Cleanup on failure
		cleanupFailedSession(client, store, sessionID)
		return provisionErr
	}

	// Update session status to running
	if err := store.Update(sessionID, session.StatusRunning); err != nil {
		verboseLog("Warning: failed to update session status: %v", err)
	}

	// Print success message with session name
	fmt.Println()
	fmt.Printf("Session created: %s\n", sessionID)

	// Determine if we should start console automatically
	// Skip if: --no-console flag is set OR stdin is not a terminal
	isInteractive := term.IsTerminal(int(os.Stdin.Fd()))
	shouldStartConsole := !noConsole && isInteractive

	if shouldStartConsole {
		// Start interactive console session
		fmt.Println("Connecting to console...")
		if repoSpec != nil {
			fmt.Printf("Repository cloned to: %s\n", repoSpec.TargetPath())
		}
		fmt.Println()

		// Start console (sprite CLI doesn't support workdir, so user may need to cd)
		consoleErr := runSpriteConsole(sessionID)

		if consoleErr != nil {
			// Console failed but session was created successfully
			// Print helpful message and don't fail the command
			fmt.Fprintln(os.Stderr)
			fmt.Fprintf(os.Stderr, "Warning: Failed to connect to console: %v\n", consoleErr)
			fmt.Fprintln(os.Stderr)
			fmt.Fprintf(os.Stderr, "Session was created successfully. Use 'sandctl console %s' to connect manually.\n", sessionID)
		}
	} else {
		// Non-interactive mode or --no-console: print usage hints
		fmt.Println()
		fmt.Printf("Use 'sandctl console %s' to connect.\n", sessionID)
		fmt.Printf("Use 'sandctl destroy %s' when done.\n", sessionID)
	}

	return nil
}

// provisionSprite creates a new sprite instance.
func provisionSprite(client *sprites.Client, name string) error {
	req := sprites.CreateSpriteRequest{
		Name: name,
	}

	sprite, err := client.CreateSprite(req)
	if err != nil {
		return fmt.Errorf("failed to provision VM: %w", err)
	}

	verboseLog("Sprite created: name=%s, state=%s", sprite.Name, sprite.State)

	// Wait for sprite to be ready
	return waitForSpriteReady(client, name)
}

// waitForSpriteReady polls until the sprite is in running state.
func waitForSpriteReady(client *sprites.Client, name string) error {
	maxAttempts := 60 // 2 minutes with 2 second intervals
	for i := 0; i < maxAttempts; i++ {
		sprite, err := client.GetSprite(name)
		if err != nil {
			verboseLog("GetSprite error (attempt %d/%d): %v", i+1, maxAttempts, err)
			return err
		}

		verboseLog("Sprite state (attempt %d/%d): %s", i+1, maxAttempts, sprite.State)

		// "cold" = just created, warms up on first request (100-500ms)
		// "warm" = hibernated but ready
		// "running" = actively running
		if sprite.State == "running" || sprite.State == "warm" || sprite.State == "cold" {
			return nil
		}

		if sprite.State == "failed" {
			return fmt.Errorf("sprite provisioning failed")
		}

		time.Sleep(2 * time.Second)
	}

	return fmt.Errorf("timeout waiting for sprite to be ready")
}

// installDevTools installs development tools in the sprite.
func installDevTools(client *sprites.Client, name string) error {
	// Sprites come with basic dev tools pre-installed
	// This step verifies the environment is ready
	_, err := client.ExecCommand(name, "which git && which node && which python3")
	if err != nil {
		return fmt.Errorf("development tools verification failed: %w", err)
	}
	return nil
}

// installOpenCode installs the OpenCode CLI in the sprite.
func installOpenCode(client *sprites.Client, name string) error {
	// Install OpenCode using the official install script
	// This is the most reliable method as it handles all setup
	installCmd := "curl -fsSL https://opencode.ai/install | bash"
	output, err := client.ExecCommand(name, installCmd)
	verboseLog("opencode install output: %s", output)
	if err != nil {
		return fmt.Errorf("failed to install OpenCode: %w\nOutput: %s", err, output)
	}

	// The install script puts opencode in ~/.opencode/bin/opencode
	// Verify installation
	verifyOutput, err := client.ExecCommand(name, "~/.opencode/bin/opencode --version 2>&1")
	verboseLog("verify output: %q", verifyOutput)
	if err != nil {
		return fmt.Errorf("OpenCode installation verification failed: %w\nOutput: %s", err, verifyOutput)
	}

	return nil
}

// setupOpenCodeAuth creates the OpenCode authentication file in the sprite.
// This writes the auth.json file that OpenCode uses to authenticate.
func setupOpenCodeAuth(client *sprites.Client, name string, zenKey string) error {
	// Create the OpenCode config directory
	mkdirCmd := "mkdir -p ~/.local/share/opencode"
	if _, err := client.ExecCommand(name, mkdirCmd); err != nil {
		// Log warning but don't fail - OpenCode might still work
		verboseLog("Warning: failed to create opencode directory: %v", err)
		fmt.Println("\n  Warning: Could not create OpenCode config directory. You may need to authenticate manually.")
		return nil
	}

	// Write the auth file with the Zen key
	// The JSON structure is: {"opencode": {"type": "api", "key": "<KEY>"}}
	authJSON := fmt.Sprintf(`{"opencode":{"type":"api","key":"%s"}}`, zenKey)
	writeCmd := fmt.Sprintf("echo '%s' > ~/.local/share/opencode/auth.json", authJSON)
	if _, err := client.ExecCommand(name, writeCmd); err != nil {
		// Log warning but don't fail - OpenCode might still work
		verboseLog("Warning: failed to write opencode auth file: %v", err)
		fmt.Println("\n  Warning: Could not write OpenCode auth file. You may need to authenticate manually.")
		return nil
	}

	return nil
}

// cleanupFailedSession removes a session that failed to provision.
func cleanupFailedSession(client *sprites.Client, store *session.Store, sessionID string) {
	verboseLog("Cleaning up failed session: %s", sessionID)

	// Try to delete the sprite (ignore errors)
	_ = client.DeleteSprite(sessionID)

	// Update local store to failed status
	_ = store.Update(sessionID, session.StatusFailed)
}

// cloneRepository clones a GitHub repository into the sprite.
// Uses a 10-minute timeout for large repositories.
func cloneRepository(client *sprites.Client, name string, repoSpec *repo.Spec) error {
	// Use timeout command to enforce 10-minute limit
	// Clone to /home/sprite/{repo-name}
	cloneCmd := fmt.Sprintf("timeout 600 git clone %s %s 2>&1",
		repoSpec.CloneURL, repoSpec.TargetPath())

	verboseLog("Clone command: %s", cloneCmd)

	output, err := client.ExecCommand(name, cloneCmd)
	verboseLog("Clone output: %s", output)

	if err != nil {
		return parseGitError(output, err, repoSpec.String())
	}

	// Also check output for git errors even if err is nil
	// (the API may return success even when the command fails)
	if gitErr := checkGitOutputForErrors(output, repoSpec.String()); gitErr != nil {
		return gitErr
	}

	return nil
}

// parseGitError converts git clone errors to user-friendly messages.
func parseGitError(output string, err error, repoName string) error {
	outputLower := strings.ToLower(output)

	// Check for timeout (exit code 124 from timeout command)
	if strings.Contains(err.Error(), "124") || strings.Contains(outputLower, "timed out") {
		return fmt.Errorf("clone timed out after 10 minutes for repository '%s'", repoName)
	}

	// Check output for common git errors
	if gitErr := checkGitOutputForErrors(output, repoName); gitErr != nil {
		return gitErr
	}

	// Generic error with output
	if output != "" {
		return fmt.Errorf("failed to clone repository '%s': %s", repoName, strings.TrimSpace(output))
	}

	return fmt.Errorf("failed to clone repository '%s': %w", repoName, err)
}

// checkGitOutputForErrors looks for git error patterns in command output.
func checkGitOutputForErrors(output string, repoName string) error {
	outputLower := strings.ToLower(output)

	// Check for repository not found
	if strings.Contains(outputLower, "repository not found") ||
		strings.Contains(outputLower, "does not exist") ||
		strings.Contains(outputLower, "not found") ||
		strings.Contains(output, "404") {
		return fmt.Errorf("repository '%s' not found", repoName)
	}

	// Check for access denied
	if strings.Contains(outputLower, "permission denied") ||
		strings.Contains(outputLower, "authentication failed") ||
		strings.Contains(outputLower, "could not read from remote") {
		return fmt.Errorf("access denied to repository '%s' (private repositories are not supported)", repoName)
	}

	// Check for network errors
	if strings.Contains(outputLower, "could not resolve host") ||
		strings.Contains(outputLower, "connection refused") ||
		strings.Contains(outputLower, "network is unreachable") {
		return fmt.Errorf("network error while cloning '%s': unable to reach GitHub", repoName)
	}

	// Check for fatal errors in git output
	if strings.Contains(outputLower, "fatal:") {
		return fmt.Errorf("failed to clone repository '%s': %s", repoName, strings.TrimSpace(output))
	}

	return nil
}
