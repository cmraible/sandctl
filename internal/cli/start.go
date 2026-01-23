package cli

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/config"
	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sprites"
	"github.com/sandctl/sandctl/internal/ui"
)

var (
	startPrompt  string
	startAgent   string
	startTimeout string
)

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Provision a new sandboxed agent session",
	Long: `Provision a new sandboxed VM and start an AI agent with the given prompt.

The system provisions a Fly.io Sprite, installs development tools, and starts
the specified AI coding agent with your prompt.`,
	Example: `  # Start with default agent (claude)
  sandctl start --prompt "Create a React todo app"

  # Start with a specific agent
  sandctl start --prompt "Build a REST API" --agent opencode

  # Start with auto-destroy timeout
  sandctl start --prompt "Experiment with new feature" --timeout 2h`,
	RunE: runStart,
}

func init() {
	startCmd.Flags().StringVarP(&startPrompt, "prompt", "p", "", "task prompt for the agent (required)")
	startCmd.Flags().StringVarP(&startAgent, "agent", "a", "", "agent type: claude, opencode, codex (default: from config or claude)")
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

	// Determine agent type
	agentType := config.AgentType(startAgent)
	if agentType == "" {
		agentType = cfg.DefaultAgent
	}
	if agentType == "" {
		agentType = config.AgentClaude
	}

	if !agentType.IsValid() {
		return fmt.Errorf("invalid agent type: %s (valid types: %v)", agentType, config.ValidAgentTypes())
	}

	// Check for API key
	apiKey, hasKey := cfg.GetAPIKey(agentType)
	if !hasKey {
		return fmt.Errorf("no API key configured for agent '%s'. Add it to your config file", agentType)
	}

	// Parse timeout if provided
	var timeout *session.Duration
	if startTimeout != "" {
		d, err := time.ParseDuration(startTimeout)
		if err != nil {
			return fmt.Errorf("invalid timeout format: %w", err)
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

	// Generate session ID
	sessionID, err := session.GenerateID()
	if err != nil {
		return fmt.Errorf("failed to generate session ID: %w", err)
	}

	verboseLog("Generated session ID: %s", sessionID)
	verboseLog("Agent type: %s", agentType)
	verboseLog("Timeout: %v", timeout)

	// Create sprites client
	client := sprites.NewClient(cfg.SpritesToken)

	fmt.Printf("Starting session with %s agent...\n", agentType)

	// Create session record (provisioning state)
	sess := session.Session{
		ID:        sessionID,
		Agent:     agentType,
		Prompt:    startPrompt,
		Status:    session.StatusProvisioning,
		CreatedAt: time.Now().UTC(),
		Timeout:   timeout,
	}

	// Add to local store immediately
	store := getSessionStore()
	if err := store.Add(sess); err != nil {
		return fmt.Errorf("failed to save session: %w", err)
	}

	// Run provisioning steps
	var provisionErr error
	steps := []ui.ProgressStep{
		{
			Message: "Provisioning VM",
			Action: func() error {
				return provisionSprite(client, sessionID, agentType, apiKey)
			},
		},
		{
			Message: "Installing development tools",
			Action: func() error {
				return installDevTools(client, sessionID)
			},
		},
		{
			Message: "Starting agent",
			Action: func() error {
				return startAgentInSprite(client, sessionID, agentType, apiKey, startPrompt)
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
	fmt.Printf("Agent: %s\n", agentType)
	fmt.Printf("Prompt: %s\n", truncateString(startPrompt, 80))
	fmt.Println()
	fmt.Printf("Use 'sandctl exec %s' to connect.\n", sessionID)
	fmt.Printf("Use 'sandctl destroy %s' when done.\n", sessionID)

	return nil
}

// provisionSprite creates a new sprite instance.
func provisionSprite(client *sprites.Client, name string, agent config.AgentType, apiKey string) error {
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
	// Sprites come with Claude pre-installed and basic dev tools
	// This step verifies the environment is ready
	_, err := client.ExecCommand(name, "which git && which node && which python3")
	if err != nil {
		return fmt.Errorf("development tools verification failed: %w", err)
	}
	return nil
}

// startAgentInSprite starts the AI agent with the given prompt.
func startAgentInSprite(client *sprites.Client, name string, agent config.AgentType, apiKey, prompt string) error {
	var cmd string

	switch agent {
	case config.AgentClaude:
		// Export API key inline and start Claude
		cmd = fmt.Sprintf("export ANTHROPIC_API_KEY=%q && nohup claude --prompt %q > /var/log/agent.log 2>&1 &", apiKey, prompt)
	case config.AgentOpencode:
		cmd = fmt.Sprintf("export ANTHROPIC_API_KEY=%q && nohup opencode --prompt %q > /var/log/agent.log 2>&1 &", apiKey, prompt)
	case config.AgentCodex:
		cmd = fmt.Sprintf("export OPENAI_API_KEY=%q && nohup codex --prompt %q > /var/log/agent.log 2>&1 &", apiKey, prompt)
	default:
		return fmt.Errorf("unsupported agent type: %s", agent)
	}

	_, err := client.ExecCommand(name, cmd)
	if err != nil {
		return fmt.Errorf("failed to start agent: %w", err)
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

// truncateString truncates a string to the given length.
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
