package cli

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sprites"
	"github.com/sandctl/sandctl/internal/ui"
)

var (
	startPrompt  string
	startTimeout string
)

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Provision a new sandboxed agent session",
	Long: `Provision a new sandboxed VM and start an AI agent with the given prompt.

The system provisions a Fly.io Sprite, installs development tools, and starts
OpenCode with your prompt. OpenCode is automatically authenticated using your
configured Zen key.`,
	Example: `  # Start a new session
  sandctl start --prompt "Create a React todo app"

  # Start with auto-destroy timeout
  sandctl start --prompt "Experiment with new feature" --timeout 2h`,
	RunE: runStart,
}

func init() {
	startCmd.Flags().StringVarP(&startPrompt, "prompt", "p", "", "task prompt for the agent (required)")
	startCmd.Flags().StringVarP(&startTimeout, "timeout", "t", "", "auto-destroy after duration (e.g., 1h, 30m)")

	_ = startCmd.MarkFlagRequired("prompt")

	rootCmd.AddCommand(startCmd)
}

func runStart(cmd *cobra.Command, args []string) error {
	// Load configuration
	cfg, err := loadConfig()
	if err != nil {
		return err
	}

	// Parse timeout if provided
	var timeout *session.Duration
	if startTimeout != "" {
		d, parseErr := time.ParseDuration(startTimeout)
		if parseErr != nil {
			return fmt.Errorf("invalid timeout format: %w", parseErr)
		}
		timeout = &session.Duration{Duration: d}
	}

	// Validate prompt
	if startPrompt == "" {
		return fmt.Errorf("prompt is required")
	}
	if len(startPrompt) > 10000 {
		return fmt.Errorf("prompt exceeds maximum length of 10000 characters")
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

	fmt.Println("Starting session with OpenCode agent...")

	// Create session record (provisioning state)
	sess := session.Session{
		ID:        sessionID,
		Prompt:    startPrompt,
		Status:    session.StatusProvisioning,
		CreatedAt: time.Now().UTC(),
		Timeout:   timeout,
	}

	// Add to local store immediately
	if err := store.Add(sess); err != nil {
		return fmt.Errorf("failed to save session: %w", err)
	}

	// Run provisioning steps
	var provisionErr error
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
		{
			Message: "Installing OpenCode",
			Action: func() error {
				return installOpenCode(client, sessionID)
			},
		},
		{
			Message: "Setting up OpenCode authentication",
			Action: func() error {
				return setupOpenCodeAuth(client, sessionID, cfg.OpencodeZenKey)
			},
		},
		{
			Message: "Starting agent",
			Action: func() error {
				return startAgentInSprite(client, sessionID, startPrompt)
			},
		},
	}

	provisionErr = ui.RunSteps(os.Stdout, steps)

	if provisionErr != nil {
		// Cleanup on failure
		cleanupFailedSession(client, store, sessionID)
		return provisionErr
	}

	// Update session status to running
	if err := store.Update(sessionID, session.StatusRunning); err != nil {
		verboseLog("Warning: failed to update session status: %v", err)
	}

	// Print success message
	fmt.Println()
	fmt.Printf("Session started: %s\n", sessionID)
	fmt.Printf("Prompt: %s\n", truncateString(startPrompt, 80))
	fmt.Println()
	fmt.Printf("Use 'sandctl exec %s' to connect.\n", sessionID)
	fmt.Printf("Use 'sandctl destroy %s' when done.\n", sessionID)

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

// startAgentInSprite starts the AI agent with the given prompt.
func startAgentInSprite(client *sprites.Client, name string, prompt string) error {
	// Start OpenCode with the prompt
	// The install script puts opencode in ~/.opencode/bin/opencode
	cmd := fmt.Sprintf("nohup ~/.opencode/bin/opencode --prompt %q > /var/log/agent.log 2>&1 &", prompt)
	verboseLog("Starting agent with command: %s", cmd)

	output, err := client.ExecCommand(name, cmd)
	verboseLog("Start agent output: %s", output)
	if err != nil {
		return fmt.Errorf("failed to start agent: %w", err)
	}

	// Check if agent process is running
	psOutput, psErr := client.ExecCommand(name, "ps aux | grep opencode | grep -v grep")
	verboseLog("Process check output: %s, err: %v", psOutput, psErr)

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

// truncateString truncates a string to the given length.
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
