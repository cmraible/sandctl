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
	initSpritesToken   string
	initOpencodeZenKey string
)

// initCmd represents the init command.
var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize sandctl configuration",
	Long: `Initialize or update sandctl configuration interactively.

This command guides you through setting up:
  - Sprites API token (for VM provisioning)
  - Opencode Zen key (for AI agent access)

If a configuration already exists, your current values are shown as defaults.
Press Enter to keep existing values, or type new ones to update.

For non-interactive setup (CI/scripts), use flags:
  sandctl init --sprites-token TOKEN --opencode-zen-key KEY`,
	RunE: runInit,
}

func init() {
	rootCmd.AddCommand(initCmd)

	// Non-interactive flags
	initCmd.Flags().StringVar(&initSpritesToken, "sprites-token", "", "Sprites API token")
	initCmd.Flags().StringVar(&initOpencodeZenKey, "opencode-zen-key", "", "Opencode Zen key for AI access")
}

// runInit executes the init command.
func runInit(cmd *cobra.Command, args []string) error {
	configPath := cfgFile
	if configPath == "" {
		configPath = config.DefaultConfigPath()
	}

	// Check if running non-interactively with flags
	hasFlags := initSpritesToken != "" || initOpencodeZenKey != ""
	if hasFlags {
		return runNonInteractiveInit(configPath)
	}

	// Check if we have a terminal for interactive mode
	if !ui.IsTerminal() {
		return errors.New("init requires a terminal for interactive mode, or use --sprites-token and --opencode-zen-key flags")
	}

	return runInitFlow(configPath, os.Stdin, os.Stdout)
}

// runNonInteractiveInit handles init with command-line flags.
func runNonInteractiveInit(configPath string) error {
	// Validate all required flags are provided
	if initSpritesToken == "" {
		return errors.New("--sprites-token is required in non-interactive mode")
	}
	if initOpencodeZenKey == "" {
		return errors.New("--opencode-zen-key is required in non-interactive mode")
	}

	// Build config
	cfg := &config.Config{
		SpritesToken:   initSpritesToken,
		OpencodeZenKey: initOpencodeZenKey,
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

	// Prompt for Opencode Zen key
	zenKey, err := promptOpencodeZenKey(prompter, existingCfg)
	if err != nil {
		return err
	}

	// Build config
	cfg := &config.Config{
		SpritesToken:   spritesToken,
		OpencodeZenKey: zenKey,
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
// This function handles migration from old config formats gracefully.
func loadExistingConfig(path string) *config.Config {
	// Try loading with validation first
	cfg, err := config.Load(path)
	if err == nil {
		return cfg
	}

	// If validation failed, try loading the raw YAML to preserve sprites_token
	// This handles migration from old config formats
	data, readErr := os.ReadFile(path)
	if readErr != nil {
		return nil
	}

	// Use a map to read all fields including old ones
	var rawCfg map[string]interface{}
	if yaml.Unmarshal(data, &rawCfg) != nil {
		return nil
	}

	// Extract sprites_token if present (for migration)
	var c config.Config
	if token, ok := rawCfg["sprites_token"].(string); ok {
		c.SpritesToken = token
	}
	// Extract opencode_zen_key if present
	if zenKey, ok := rawCfg["opencode_zen_key"].(string); ok {
		c.OpencodeZenKey = zenKey
	}

	// Only return if we found at least one field
	if c.SpritesToken != "" || c.OpencodeZenKey != "" {
		return &c
	}

	return nil
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

// promptOpencodeZenKey prompts for the Opencode Zen key.
func promptOpencodeZenKey(prompter *ui.Prompter, existingCfg *config.Config) (string, error) {
	hasExisting := existingCfg != nil && existingCfg.OpencodeZenKey != ""

	if hasExisting {
		// Show masked key and allow keeping existing
		key, keepExisting, err := prompter.PromptSecretWithDefault("Opencode Zen key", true)
		if err != nil {
			return "", err
		}
		if keepExisting {
			return existingCfg.OpencodeZenKey, nil
		}
		return key, nil
	}

	// No existing key, require new input
	key, err := prompter.PromptSecret("Opencode Zen key")
	if err != nil {
		return "", err
	}
	if key == "" {
		return "", errors.New("Opencode Zen key is required")
	}
	return key, nil
}

// unmarshalYAML is a helper for testing that wraps yaml.Unmarshal.
func unmarshalYAML(data []byte, v interface{}) error {
	return yaml.Unmarshal(data, v)
}
