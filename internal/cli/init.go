package cli

import (
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"

	"github.com/sandctl/sandctl/internal/config"
	"github.com/sandctl/sandctl/internal/ui"
)

var (
	// Flags for non-interactive mode
	initSpritesToken string
	initAgent        string
	initAPIKey       string
)

// initCmd represents the init command.
var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize sandctl configuration",
	Long: `Initialize or update sandctl configuration interactively.

This command guides you through setting up:
  - Sprites API token (for VM provisioning)
  - Default AI coding agent (claude, opencode, or codex)
  - API key for your selected agent

If a configuration already exists, your current values are shown as defaults.
Press Enter to keep existing values, or type new ones to update.

For non-interactive setup (CI/scripts), use flags:
  sandctl init --sprites-token TOKEN --agent claude --api-key KEY`,
	RunE: runInit,
}

func init() {
	rootCmd.AddCommand(initCmd)

	// Non-interactive flags
	initCmd.Flags().StringVar(&initSpritesToken, "sprites-token", "", "Sprites API token")
	initCmd.Flags().StringVar(&initAgent, "agent", "", "Default agent (claude, opencode, codex)")
	initCmd.Flags().StringVar(&initAPIKey, "api-key", "", "API key for the selected agent")
}

// runInit executes the init command.
func runInit(cmd *cobra.Command, args []string) error {
	configPath := cfgFile
	if configPath == "" {
		configPath = config.DefaultConfigPath()
	}

	// Check if running non-interactively with flags
	hasFlags := initSpritesToken != "" || initAgent != "" || initAPIKey != ""
	if hasFlags {
		return runNonInteractiveInit(configPath)
	}

	// Check if we have a terminal for interactive mode
	if !ui.IsTerminal() {
		return errors.New("init requires a terminal for interactive mode, or use --sprites-token, --agent, and --api-key flags")
	}

	return runInitFlow(configPath, os.Stdin, os.Stdout)
}

// runNonInteractiveInit handles init with command-line flags.
func runNonInteractiveInit(configPath string) error {
	// Validate all required flags are provided
	if initSpritesToken == "" {
		return errors.New("--sprites-token is required in non-interactive mode")
	}
	if initAgent == "" {
		return errors.New("--agent is required in non-interactive mode")
	}
	if initAPIKey == "" {
		return errors.New("--api-key is required in non-interactive mode")
	}

	// Validate agent type
	agentType := config.AgentType(initAgent)
	if !agentType.IsValid() {
		return fmt.Errorf("invalid agent %q, must be one of: %v", initAgent, config.ValidAgentTypes())
	}

	// Build config
	cfg := &config.Config{
		SpritesToken: initSpritesToken,
		DefaultAgent: agentType,
		AgentAPIKeys: map[string]string{
			string(agentType): initAPIKey,
		},
	}

	// Save config
	if err := config.Save(configPath, cfg); err != nil {
		return fmt.Errorf("failed to save configuration: %w", err)
	}

	fmt.Printf("Configuration saved to %s\n", configPath)
	return nil
}

// runInitFlow runs the interactive init flow.
func runInitFlow(configPath string, input io.Reader, output io.Writer) error {
	prompter := ui.NewPrompter(input, output)

	// Load existing config if present
	existingCfg := loadExistingConfig(configPath)

	fmt.Fprintln(output, "sandctl Configuration")
	fmt.Fprintln(output, "=====================")
	fmt.Fprintln(output)

	// Prompt for Sprites token
	spritesToken, err := promptSpritesToken(prompter, existingCfg)
	if err != nil {
		return err
	}

	// Prompt for agent selection
	agent, err := promptAgentSelection(prompter, output, existingCfg)
	if err != nil {
		return err
	}

	// Prompt for API key
	apiKey, keepExistingKey, err := promptAPIKey(prompter, agent, existingCfg)
	if err != nil {
		return err
	}

	// Build config
	cfg := &config.Config{
		SpritesToken: spritesToken,
		DefaultAgent: agent,
		AgentAPIKeys: make(map[string]string),
	}

	// Preserve existing API keys and add/update the current one
	if existingCfg != nil && existingCfg.AgentAPIKeys != nil {
		for k, v := range existingCfg.AgentAPIKeys {
			cfg.AgentAPIKeys[k] = v
		}
	}
	if !keepExistingKey && apiKey != "" {
		cfg.AgentAPIKeys[string(agent)] = apiKey
	}

	// Warn if no API key is configured for the selected agent
	if _, hasKey := cfg.AgentAPIKeys[string(agent)]; !hasKey || cfg.AgentAPIKeys[string(agent)] == "" {
		fmt.Fprintln(output)
		fmt.Fprintf(output, "Warning: No API key configured for %s. Some features may not work.\n", agent)
	}

	// Save config
	if err := config.Save(configPath, cfg); err != nil {
		return fmt.Errorf("failed to save configuration: %w", err)
	}

	// Show success message
	fmt.Fprintln(output)
	fmt.Fprintf(output, "Configuration saved successfully to %s\n", configPath)
	fmt.Fprintln(output)
	fmt.Fprintln(output, "Next steps:")
	fmt.Fprintln(output, "  sandctl start --prompt \"Create a React todo app\"")
	fmt.Fprintln(output)

	return nil
}

// loadExistingConfig attempts to load an existing config file.
// Returns nil if no config exists or if it cannot be loaded.
func loadExistingConfig(path string) *config.Config {
	cfg, err := config.Load(path)
	if err != nil {
		// Try loading without permission check for reconfiguration
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil
		}
		var c config.Config
		if yaml.Unmarshal(data, &c) != nil {
			return nil
		}
		return &c
	}
	return cfg
}

// promptSpritesToken prompts for the Sprites API token.
func promptSpritesToken(prompter *ui.Prompter, existingCfg *config.Config) (string, error) {
	hasExisting := existingCfg != nil && existingCfg.SpritesToken != ""

	if hasExisting {
		// Show masked token and allow keeping existing
		token, keepExisting, err := prompter.PromptSecretWithDefault("Sprites API token", true)
		if err != nil {
			return "", err
		}
		if keepExisting {
			return existingCfg.SpritesToken, nil
		}
		return token, nil
	}

	// No existing token, require new input
	token, err := prompter.PromptSecret("Sprites API token")
	if err != nil {
		return "", err
	}
	if token == "" {
		return "", errors.New("Sprites API token is required")
	}
	return token, nil
}

// promptAgentSelection prompts for the default agent.
func promptAgentSelection(prompter *ui.Prompter, output io.Writer, existingCfg *config.Config) (config.AgentType, error) {
	options := []ui.SelectOption{
		{Value: "claude", Label: "claude", Description: "Anthropic Claude"},
		{Value: "opencode", Label: "opencode", Description: "OpenCode AI"},
		{Value: "codex", Label: "codex", Description: "OpenAI Codex"},
	}

	// Determine default index
	defaultIndex := 0
	if existingCfg != nil && existingCfg.DefaultAgent != "" {
		for i, opt := range options {
			if opt.Value == string(existingCfg.DefaultAgent) {
				defaultIndex = i
				break
			}
		}
	}

	fmt.Fprintln(output)
	idx, err := prompter.PromptSelect("Select default AI agent:", options, defaultIndex)
	if err != nil {
		return "", err
	}

	return config.AgentType(options[idx].Value), nil
}

// promptAPIKey prompts for the API key for the selected agent.
func promptAPIKey(prompter *ui.Prompter, agent config.AgentType, existingCfg *config.Config) (string, bool, error) {
	hasExisting := existingCfg != nil && existingCfg.AgentAPIKeys != nil
	existingKey := ""
	if hasExisting {
		existingKey = existingCfg.AgentAPIKeys[string(agent)]
	}

	prompt := fmt.Sprintf("API key for %s", agent)

	if existingKey != "" {
		key, keepExisting, err := prompter.PromptSecretWithDefault(prompt, true)
		if err != nil {
			return "", false, err
		}
		return key, keepExisting, nil
	}

	// No existing key
	key, err := prompter.PromptSecret(prompt)
	if err != nil {
		return "", false, err
	}

	return key, false, nil
}

// unmarshalYAML is a helper for testing that wraps yaml.Unmarshal.
func unmarshalYAML(data []byte, v interface{}) error {
	return yaml.Unmarshal(data, v)
}
