package cli

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"

	"github.com/sandctl/sandctl/internal/config"
	"github.com/sandctl/sandctl/internal/ui"
)

var (
	// Flags for non-interactive mode
	initHetznerToken   string
	initSSHPublicKey   string
	initRegion         string
	initServerType     string
	initOpencodeZenKey string
)

// initCmd represents the init command.
var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize sandctl configuration",
	Long: `Initialize or update sandctl configuration interactively.

This command guides you through setting up:
  - Hetzner Cloud API token (for VM provisioning)
  - SSH public key path (for VM access)
  - Default region and server type
  - Opencode Zen key (optional, for AI agent access)

If a configuration already exists, your current values are shown as defaults.
Press Enter to keep existing values, or type new ones to update.

For non-interactive setup (CI/scripts), use flags:
  sandctl init --hetzner-token TOKEN --ssh-public-key ~/.ssh/id_ed25519.pub`,
	RunE: runInit,
}

func init() {
	rootCmd.AddCommand(initCmd)

	// Non-interactive flags
	initCmd.Flags().StringVar(&initHetznerToken, "hetzner-token", "", "Hetzner Cloud API token")
	initCmd.Flags().StringVar(&initSSHPublicKey, "ssh-public-key", "", "Path to SSH public key (e.g., ~/.ssh/id_ed25519.pub)")
	initCmd.Flags().StringVar(&initRegion, "region", "", "Default Hetzner region (ash, hel1, fsn1, nbg1)")
	initCmd.Flags().StringVar(&initServerType, "server-type", "", "Default server type (cpx21, cpx31, cpx41)")
	initCmd.Flags().StringVar(&initOpencodeZenKey, "opencode-zen-key", "", "Opencode Zen key for AI access (optional)")
}

// runInit executes the init command.
func runInit(cmd *cobra.Command, args []string) error {
	configPath := cfgFile
	if configPath == "" {
		configPath = config.DefaultConfigPath()
	}

	// Check if running non-interactively with flags
	hasFlags := initHetznerToken != "" || initSSHPublicKey != ""
	if hasFlags {
		return runNonInteractiveInit(configPath)
	}

	// Check if we have a terminal for interactive mode
	if !ui.IsTerminal() {
		return errors.New("init requires a terminal for interactive mode, or use --hetzner-token and --ssh-public-key flags")
	}

	return runInitFlow(configPath, os.Stdin, os.Stdout)
}

// runNonInteractiveInit handles init with command-line flags.
func runNonInteractiveInit(configPath string) error {
	// Validate all required flags are provided
	if initHetznerToken == "" {
		return errors.New("--hetzner-token is required in non-interactive mode")
	}
	if initSSHPublicKey == "" {
		return errors.New("--ssh-public-key is required in non-interactive mode")
	}

	// Expand SSH key path
	sshKeyPath := expandPath(initSSHPublicKey)
	if _, err := os.Stat(sshKeyPath); err != nil {
		return fmt.Errorf("SSH public key not found: %s", sshKeyPath)
	}

	// Set defaults
	region := initRegion
	if region == "" {
		region = "ash"
	}
	serverType := initServerType
	if serverType == "" {
		serverType = "cpx31"
	}

	// Build config
	cfg := &config.Config{
		DefaultProvider: "hetzner",
		SSHPublicKey:    initSSHPublicKey,
		OpencodeZenKey:  initOpencodeZenKey,
		Providers: map[string]config.ProviderConfig{
			"hetzner": {
				Token:      initHetznerToken,
				Region:     region,
				ServerType: serverType,
				Image:      "ubuntu-24.04",
			},
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

	// Check for legacy config migration
	if existingCfg != nil && existingCfg.IsLegacyConfig() {
		fmt.Fprintln(output, "Migrating from Sprites to pluggable providers...")
		fmt.Fprintln(output)
	}

	// Prompt for Hetzner token
	hetznerToken, err := promptHetznerToken(prompter, existingCfg)
	if err != nil {
		return err
	}

	// Prompt for SSH public key path
	sshKeyPath, err := promptSSHPublicKey(prompter, existingCfg)
	if err != nil {
		return err
	}

	// Prompt for region
	region, err := promptRegion(prompter, existingCfg)
	if err != nil {
		return err
	}

	// Prompt for server type
	serverType, err := promptServerType(prompter, existingCfg)
	if err != nil {
		return err
	}

	// Prompt for Opencode Zen key (optional)
	zenKey, err := promptOpencodeZenKey(prompter, existingCfg)
	if err != nil {
		return err
	}

	// Build config
	cfg := &config.Config{
		DefaultProvider: "hetzner",
		SSHPublicKey:    sshKeyPath,
		OpencodeZenKey:  zenKey,
		Providers: map[string]config.ProviderConfig{
			"hetzner": {
				Token:      hetznerToken,
				Region:     region,
				ServerType: serverType,
				Image:      "ubuntu-24.04",
			},
		},
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
	fmt.Fprintln(output, "  sandctl new")
	fmt.Fprintln(output)

	return nil
}

// loadExistingConfig attempts to load an existing config file.
// Returns nil if no config exists or if it cannot be loaded.
func loadExistingConfig(path string) *config.Config {
	// Try loading with validation first
	cfg, err := config.Load(path)
	if err == nil {
		return cfg
	}

	// If validation failed, try loading the raw YAML to preserve values
	data, readErr := os.ReadFile(path)
	if readErr != nil {
		return nil
	}

	// Use a map to read all fields including old ones
	var rawCfg map[string]interface{}
	if yaml.Unmarshal(data, &rawCfg) != nil {
		return nil
	}

	// Extract fields
	var c config.Config

	// Legacy fields
	if token, ok := rawCfg["sprites_token"].(string); ok {
		c.SpritesToken = token
	}
	if zenKey, ok := rawCfg["opencode_zen_key"].(string); ok {
		c.OpencodeZenKey = zenKey
	}

	// New fields
	if dp, ok := rawCfg["default_provider"].(string); ok {
		c.DefaultProvider = dp
	}
	if sshKey, ok := rawCfg["ssh_public_key"].(string); ok {
		c.SSHPublicKey = sshKey
	}

	// Providers (complex structure)
	if providers, ok := rawCfg["providers"].(map[string]interface{}); ok {
		c.Providers = make(map[string]config.ProviderConfig)
		for name, provRaw := range providers {
			if prov, ok := provRaw.(map[string]interface{}); ok {
				pc := config.ProviderConfig{}
				if token, ok := prov["token"].(string); ok {
					pc.Token = token
				}
				if region, ok := prov["region"].(string); ok {
					pc.Region = region
				}
				if st, ok := prov["server_type"].(string); ok {
					pc.ServerType = st
				}
				if img, ok := prov["image"].(string); ok {
					pc.Image = img
				}
				c.Providers[name] = pc
			}
		}
	}

	// Only return if we found at least one field
	if c.SpritesToken != "" || c.OpencodeZenKey != "" || c.DefaultProvider != "" {
		return &c
	}

	return nil
}

// promptHetznerToken prompts for the Hetzner API token.
func promptHetznerToken(prompter *ui.Prompter, existingCfg *config.Config) (string, error) {
	hasExisting := false
	if existingCfg != nil {
		if hetznerCfg, ok := existingCfg.GetProviderConfig("hetzner"); ok && hetznerCfg.Token != "" {
			hasExisting = true
		}
	}

	if hasExisting {
		token, keepExisting, err := prompter.PromptSecretWithDefault("Hetzner API token", true)
		if err != nil {
			return "", err
		}
		if keepExisting {
			cfg, _ := existingCfg.GetProviderConfig("hetzner")
			return cfg.Token, nil
		}
		return token, nil
	}

	fmt.Println("Get your Hetzner API token at: https://console.hetzner.cloud")
	fmt.Println("  -> Your Project -> Security -> API Tokens -> Generate API Token")
	fmt.Println()

	token, err := prompter.PromptSecret("Hetzner API token")
	if err != nil {
		return "", err
	}
	if token == "" {
		return "", errors.New("Hetzner API token is required")
	}
	return token, nil
}

// promptSSHPublicKey prompts for the SSH public key path.
func promptSSHPublicKey(prompter *ui.Prompter, existingCfg *config.Config) (string, error) {
	defaultPath := "~/.ssh/id_ed25519.pub"

	// Check for existing value
	if existingCfg != nil && existingCfg.SSHPublicKey != "" {
		defaultPath = existingCfg.SSHPublicKey
	}

	// Try to find default key if not configured
	if existingCfg == nil || existingCfg.SSHPublicKey == "" {
		home, _ := os.UserHomeDir()
		keyPaths := []string{
			filepath.Join(home, ".ssh", "id_ed25519.pub"),
			filepath.Join(home, ".ssh", "id_rsa.pub"),
		}
		for _, p := range keyPaths {
			if _, err := os.Stat(p); err == nil {
				defaultPath = "~/.ssh/" + filepath.Base(p)
				break
			}
		}
	}

	path, err := prompter.PromptWithDefault("SSH public key path", defaultPath)
	if err != nil {
		return "", err
	}

	// Validate the path exists
	expandedPath := expandPath(path)
	if _, err := os.Stat(expandedPath); err != nil {
		return "", fmt.Errorf("SSH public key not found: %s", expandedPath)
	}

	return path, nil
}

// promptRegion prompts for the default region.
func promptRegion(prompter *ui.Prompter, existingCfg *config.Config) (string, error) {
	defaultRegion := "ash"

	if existingCfg != nil {
		if hetznerCfg, ok := existingCfg.GetProviderConfig("hetzner"); ok && hetznerCfg.Region != "" {
			defaultRegion = hetznerCfg.Region
		}
	}

	fmt.Println()
	fmt.Println("Available regions:")
	fmt.Println("  ash  - Ashburn, Virginia (US East)")
	fmt.Println("  hel1 - Helsinki, Finland")
	fmt.Println("  fsn1 - Falkenstein, Germany")
	fmt.Println("  nbg1 - Nuremberg, Germany")
	fmt.Println()

	return prompter.PromptWithDefault("Default region", defaultRegion)
}

// promptServerType prompts for the default server type.
func promptServerType(prompter *ui.Prompter, existingCfg *config.Config) (string, error) {
	defaultType := "cpx31"

	if existingCfg != nil {
		if hetznerCfg, ok := existingCfg.GetProviderConfig("hetzner"); ok && hetznerCfg.ServerType != "" {
			defaultType = hetznerCfg.ServerType
		}
	}

	fmt.Println()
	fmt.Println("Available server types (AMD EPYC):")
	fmt.Println("  cpx21 - 3 vCPU, 4GB RAM  (~€0.01/hr)")
	fmt.Println("  cpx31 - 4 vCPU, 8GB RAM  (~€0.02/hr)")
	fmt.Println("  cpx41 - 8 vCPU, 16GB RAM (~€0.04/hr)")
	fmt.Println("  cpx51 - 16 vCPU, 32GB RAM (~€0.07/hr)")
	fmt.Println()

	return prompter.PromptWithDefault("Default server type", defaultType)
}

// promptOpencodeZenKey prompts for the Opencode Zen key.
func promptOpencodeZenKey(prompter *ui.Prompter, existingCfg *config.Config) (string, error) {
	hasExisting := existingCfg != nil && existingCfg.OpencodeZenKey != ""

	fmt.Println()
	fmt.Println("OpenCode Zen key (optional, for AI agent integration)")

	if hasExisting {
		key, keepExisting, err := prompter.PromptSecretWithDefault("Opencode Zen key", true)
		if err != nil {
			return "", err
		}
		if keepExisting {
			return existingCfg.OpencodeZenKey, nil
		}
		return key, nil
	}

	// Optional field - allow empty
	key, err := prompter.PromptSecret("Opencode Zen key (press Enter to skip)")
	if err != nil {
		return "", err
	}
	return key, nil
}

// expandPath expands ~ to the user's home directory.
func expandPath(path string) string {
	if strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return path
		}
		return filepath.Join(home, path[2:])
	}
	return path
}
