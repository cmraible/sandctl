package cli

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"

	"github.com/sandctl/sandctl/internal/config"
	"github.com/sandctl/sandctl/internal/sshagent"
	"github.com/sandctl/sandctl/internal/sshexec"
	"github.com/sandctl/sandctl/internal/ui"
)

var (
	// Flags for non-interactive mode
	initHetznerToken      string
	initSSHPublicKey      string
	initSSHAgent          bool
	initSSHKeyFingerprint string
	initRegion            string
	initServerType        string
	initOpencodeZenKey    string
)

// initCmd represents the init command.
var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize sandctl configuration",
	Long: `Initialize or update sandctl configuration interactively.

This command guides you through setting up:
  - Hetzner Cloud API token (for VM provisioning)
  - SSH public key (from agent or file path)
  - Default region and server type
  - Opencode Zen key (optional, for AI agent access)

SSH keys can be configured from:
  - SSH Agent (1Password, ssh-agent, gpg-agent) - recommended
  - File path to public key file

If a configuration already exists, your current values are shown as defaults.
Press Enter to keep existing values, or type new ones to update.

For non-interactive setup (CI/scripts), use flags:
  sandctl init --hetzner-token TOKEN --ssh-agent
  sandctl init --hetzner-token TOKEN --ssh-public-key ~/.ssh/id_ed25519.pub`,
	RunE: runInit,
}

func init() {
	rootCmd.AddCommand(initCmd)

	// Non-interactive flags
	initCmd.Flags().StringVar(&initHetznerToken, "hetzner-token", "", "Hetzner Cloud API token")
	initCmd.Flags().StringVar(&initSSHPublicKey, "ssh-public-key", "", "Path to SSH public key (e.g., ~/.ssh/id_ed25519.pub)")
	initCmd.Flags().BoolVar(&initSSHAgent, "ssh-agent", false, "Use SSH agent for key management (1Password, ssh-agent)")
	initCmd.Flags().StringVar(&initSSHKeyFingerprint, "ssh-key-fingerprint", "", "SSH key fingerprint when using --ssh-agent with multiple keys")
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

	// Validate mutually exclusive flags
	if initSSHAgent && initSSHPublicKey != "" {
		return errors.New("--ssh-agent and --ssh-public-key are mutually exclusive")
	}

	// Check if running non-interactively with flags
	hasFlags := initHetznerToken != "" || initSSHPublicKey != "" || initSSHAgent
	if hasFlags {
		return runNonInteractiveInit(configPath)
	}

	// Check if we have a terminal for interactive mode
	if !ui.IsTerminal() {
		return errors.New("init requires a terminal for interactive mode, or use --hetzner-token with --ssh-agent or --ssh-public-key flags")
	}

	return runInitFlow(configPath, os.Stdin, os.Stdout)
}

// runNonInteractiveInit handles init with command-line flags.
func runNonInteractiveInit(configPath string) error {
	// Validate all required flags are provided
	if initHetznerToken == "" {
		return errors.New("--hetzner-token is required in non-interactive mode")
	}
	if !initSSHAgent && initSSHPublicKey == "" {
		return errors.New("--ssh-public-key or --ssh-agent is required in non-interactive mode")
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

	// Handle SSH key configuration
	if initSSHAgent {
		// SSH agent mode
		agent, err := sshagent.New()
		if err != nil {
			return fmt.Errorf("failed to connect to SSH agent: %w", err)
		}
		defer agent.Close()

		var key *sshagent.AgentKey
		if initSSHKeyFingerprint != "" {
			// Use specific key by fingerprint
			key, err = agent.GetKeyByFingerprint(initSSHKeyFingerprint)
			if err != nil {
				return err
			}
		} else {
			// Use first available key
			keys, err := agent.ListKeys()
			if err != nil {
				return err
			}
			key = &keys[0]
		}

		cfg.SSHKeySource = "agent"
		cfg.SSHPublicKeyInline = strings.TrimSpace(key.PublicKey)
		cfg.SSHKeyFingerprint = key.Fingerprint
	} else {
		// File mode
		sshKeyPath := expandPath(initSSHPublicKey)
		if _, err := os.Stat(sshKeyPath); err != nil {
			return fmt.Errorf("SSH public key not found: %s", sshKeyPath)
		}
		cfg.SSHPublicKey = initSSHPublicKey
	}

	// Save config
	if err := config.Save(configPath, cfg); err != nil {
		return fmt.Errorf("failed to save configuration: %w", err)
	}

	fmt.Printf("Configuration saved to %s\n", configPath)
	return nil
}

// sshKeyConfig holds SSH key configuration from interactive prompts.
type sshKeyConfig struct {
	source      string // "agent" or "file"
	filePath    string // For file mode
	publicKey   string // For agent mode
	fingerprint string // For agent mode
}

// GitConfigMethod represents the user's chosen method for Git configuration.
type GitConfigMethod int

const (
	MethodDefault   GitConfigMethod = iota // Use ~/.gitconfig
	MethodCustom                            // Use custom path
	MethodCreateNew                         // Generate from name/email
	MethodSkip                              // Skip Git config
)

// GitIdentity holds user identity information for Git configuration.
type GitIdentity struct {
	Name  string
	Email string
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

	// Prompt for SSH key configuration (agent or file)
	sshCfg, err := promptSSHKeyConfig(prompter, output, existingCfg)
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

	// Prompt for Git configuration (optional)
	gitMethod, gitContent, err := promptGitConfig(prompter)
	if err != nil {
		// Git config is optional, so don't fail the entire init if it errors
		fmt.Fprintf(output, "\nWarning: Git configuration failed: %v\n", err)
		fmt.Fprintln(output, "You can configure Git manually in VMs or re-run 'sandctl init' later.")
		gitMethod = MethodSkip
		gitContent = nil
	}

	// Build config
	cfg := &config.Config{
		DefaultProvider: "hetzner",
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

	// Save Git config settings
	cfg.GitConfigMethod = gitMethodToString(gitMethod)
	if gitMethod != MethodSkip && len(gitContent) > 0 {
		// Encode content as base64 for safe YAML storage
		cfg.GitConfigContent = encodeGitConfig(gitContent)
	}

	// Set SSH key configuration based on source
	if sshCfg.source == "agent" {
		cfg.SSHKeySource = "agent"
		cfg.SSHPublicKeyInline = sshCfg.publicKey
		cfg.SSHKeyFingerprint = sshCfg.fingerprint
	} else {
		cfg.SSHPublicKey = sshCfg.filePath
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

// promptSSHKeyConfig prompts for SSH key configuration (agent or file).
func promptSSHKeyConfig(prompter *ui.Prompter, output io.Writer, existingCfg *config.Config) (*sshKeyConfig, error) {
	// Check if SSH agent is available
	agentAvailable := sshagent.IsAvailable()
	keyCount := sshagent.KeyCount()

	// If existing config uses agent mode, prefer that
	if existingCfg != nil && existingCfg.IsAgentMode() {
		fmt.Fprintln(output)
		fmt.Fprintln(output, "Current SSH key source: SSH Agent")
		fmt.Fprintf(output, "  Fingerprint: %s\n", existingCfg.SSHKeyFingerprint)

		keepExisting, err := prompter.PromptYesNo("Keep current SSH agent key configuration?", true)
		if err != nil {
			return nil, err
		}
		if keepExisting {
			return &sshKeyConfig{
				source:      "agent",
				publicKey:   existingCfg.SSHPublicKeyInline,
				fingerprint: existingCfg.SSHKeyFingerprint,
			}, nil
		}
	}

	// Show SSH key source options
	fmt.Fprintln(output)
	fmt.Fprintln(output, "SSH key source:")

	if agentAvailable {
		fmt.Fprintf(output, "  1) SSH Agent (recommended) - %d key(s) available\n", keyCount)
	} else {
		fmt.Fprintln(output, "  1) SSH Agent - not available")
	}
	fmt.Fprintln(output, "  2) File path - specify path to public key file")
	fmt.Fprintln(output)

	// Determine default based on availability
	defaultChoice := "1"
	if !agentAvailable {
		defaultChoice = "2"
	}

	choice, err := prompter.PromptWithDefault("Select", defaultChoice)
	if err != nil {
		return nil, err
	}

	choice = strings.TrimSpace(choice)

	if choice == "1" {
		if !agentAvailable {
			fmt.Fprintln(output)
			fmt.Fprintln(output, "No SSH agent found. Please ensure your SSH agent is running.")
			fmt.Fprintln(output, "  - For 1Password: Enable SSH Agent in Settings > Developer")
			fmt.Fprintln(output, "  - For ssh-agent: Run 'ssh-add ~/.ssh/id_ed25519'")
			fmt.Fprintln(output)
			fmt.Fprintln(output, "Falling back to file path mode...")
			return promptSSHFilePath(prompter, existingCfg)
		}
		return promptSSHAgentKey(prompter, output)
	}

	return promptSSHFilePath(prompter, existingCfg)
}

// promptSSHAgentKey prompts for SSH key selection from agent.
func promptSSHAgentKey(prompter *ui.Prompter, output io.Writer) (*sshKeyConfig, error) {
	agent, err := sshagent.New()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to SSH agent: %w", err)
	}
	defer agent.Close()

	keys, err := agent.ListKeys()
	if err != nil {
		return nil, err
	}

	// If only one key, auto-select it
	if len(keys) == 1 {
		key := keys[0]
		fmt.Fprintln(output)
		fmt.Fprintf(output, "Using SSH key: %s\n", key.DisplayString())
		return &sshKeyConfig{
			source:      "agent",
			publicKey:   strings.TrimSpace(key.PublicKey),
			fingerprint: key.Fingerprint,
		}, nil
	}

	// Multiple keys - show selection
	fmt.Fprintln(output)
	fmt.Fprintln(output, "Available SSH keys from agent:")
	for i, key := range keys {
		fmt.Fprintf(output, "  %d) %s\n", i+1, key.DisplayString())
	}
	fmt.Fprintln(output)

	selection, err := prompter.PromptWithDefault("Select key", "1")
	if err != nil {
		return nil, err
	}

	// Parse selection
	var idx int
	if _, err := fmt.Sscanf(selection, "%d", &idx); err != nil || idx < 1 || idx > len(keys) {
		return nil, fmt.Errorf("invalid selection: %s", selection)
	}

	key := keys[idx-1]
	return &sshKeyConfig{
		source:      "agent",
		publicKey:   strings.TrimSpace(key.PublicKey),
		fingerprint: key.Fingerprint,
	}, nil
}

// promptSSHFilePath prompts for SSH public key file path.
func promptSSHFilePath(prompter *ui.Prompter, existingCfg *config.Config) (*sshKeyConfig, error) {
	defaultPath := "~/.ssh/id_ed25519.pub"

	// Check for existing value (file mode only)
	if existingCfg != nil && existingCfg.SSHPublicKey != "" && !existingCfg.IsAgentMode() {
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
		return nil, err
	}

	// Validate the path exists
	expandedPath := expandPath(path)
	if _, err := os.Stat(expandedPath); err != nil {
		return nil, fmt.Errorf("SSH public key not found: %s", expandedPath)
	}

	return &sshKeyConfig{
		source:   "file",
		filePath: path,
	}, nil
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

// selectGitConfigMethod prompts the user to choose how to configure Git.
// The available options depend on whether ~/.gitconfig exists and is readable.
func selectGitConfigMethod(prompter *ui.Prompter) (GitConfigMethod, error) {
	var options []ui.SelectOption
	methodMap := make(map[int]GitConfigMethod)
	optionIndex := 0

	// Check if ~/.gitconfig exists and is readable
	home, err := os.UserHomeDir()
	hasDefaultConfig := false
	if err == nil {
		gitconfigPath := filepath.Join(home, ".gitconfig")
		if _, err := os.Stat(gitconfigPath); err == nil {
			// Default option available (FR-003, FR-004)
			options = append(options, ui.SelectOption{
				Value:       "default",
				Label:       "Default",
				Description: "Use your ~/.gitconfig (recommended)",
			})
			methodMap[optionIndex] = MethodDefault
			optionIndex++
			hasDefaultConfig = true
		}
	}

	// Always present custom and create options (FR-003)
	options = append(options, ui.SelectOption{
		Value:       "custom",
		Label:       "Custom",
		Description: "Specify path to different config file",
	})
	methodMap[optionIndex] = MethodCustom
	optionIndex++

	options = append(options, ui.SelectOption{
		Value:       "create",
		Label:       "Create New",
		Description: "Enter name and email to generate config",
	})
	methodMap[optionIndex] = MethodCreateNew
	optionIndex++

	options = append(options, ui.SelectOption{
		Value:       "skip",
		Label:       "Skip",
		Description: "Continue without Git configuration",
	})
	methodMap[optionIndex] = MethodSkip

	// Default index: 0 if default available, else skip (last option)
	defaultIndex := 0
	if !hasDefaultConfig {
		defaultIndex = len(options) - 1 // Skip option
	}

	choice, err := prompter.PromptSelect("How would you like to configure Git in the VM?", options, defaultIndex)
	if err != nil {
		return MethodSkip, err
	}

	return methodMap[choice], nil
}

// promptCustomGitConfigPath prompts the user for a path to a .gitconfig file
// and validates that it exists and is readable.
func promptCustomGitConfigPath(prompter *ui.Prompter) (string, error) {
	for {
		path, err := prompter.PromptString("Enter path to Git config file", "")
		if err != nil {
			return "", err
		}

		// Allow empty input to cancel
		if strings.TrimSpace(path) == "" {
			return "", errors.New("path cannot be empty")
		}

		// Expand path and validate
		expandedPath := expandPath(path)

		// Convert relative path to absolute
		absPath, err := filepath.Abs(expandedPath)
		if err != nil {
			fmt.Printf("Invalid path: %v\n\n", err)
			continue
		}

		// Check if file exists
		info, err := os.Stat(absPath)
		if err != nil {
			if os.IsNotExist(err) {
				fmt.Printf("File not found: %s. Please check the path and try again.\n\n", path)
			} else if os.IsPermission(err) {
				fmt.Printf("Cannot read file: %s (permission denied). Please check file permissions.\n\n", path)
			} else {
				fmt.Printf("Error accessing file: %v\n\n", err)
			}
			continue
		}

		// Check if it's a directory
		if info.IsDir() {
			fmt.Printf("%s is a directory. Please provide a path to a file.\n\n", path)
			continue
		}

		return path, nil
	}
}

// promptGitIdentity prompts the user for name and email to create a Git config.
// Validates email format per FR-013.
func promptGitIdentity(prompter *ui.Prompter) (GitIdentity, error) {
	var identity GitIdentity

	// Prompt for name with non-empty validation
	for {
		name, err := prompter.PromptString("Enter your full name", "")
		if err != nil {
			return identity, err
		}

		name = strings.TrimSpace(name)
		if name == "" {
			fmt.Println("Name cannot be empty. Please enter your full name.")
			fmt.Println()
			continue
		}

		identity.Name = name
		break
	}

	// Prompt for email with validation
	for {
		email, err := prompter.PromptString("Enter your email address", "")
		if err != nil {
			return identity, err
		}

		email = strings.TrimSpace(email)
		if err := validateEmail(email); err != nil {
			fmt.Printf("Invalid email format: %v\n", err)
			fmt.Println("Example: user@example.com")
			fmt.Println()
			continue
		}

		identity.Email = email
		break
	}

	return identity, nil
}

// promptGitConfig prompts the user to configure Git in the VM and returns
// the selected method and any necessary data for transfer.
func promptGitConfig(prompter *ui.Prompter) (method GitConfigMethod, content []byte, err error) {
	fmt.Println()
	fmt.Println("Git Configuration")
	fmt.Println()

	// Select method
	method, err = selectGitConfigMethod(prompter)
	if err != nil {
		return MethodSkip, nil, err
	}

	// Handle method selection
	switch method {
	case MethodDefault:
		content, err = readDefaultGitConfig()
		if err != nil {
			return method, nil, fmt.Errorf("failed to read default Git config: %w", err)
		}
		return method, content, nil

	case MethodCustom:
		path, err := promptCustomGitConfigPath(prompter)
		if err != nil {
			return method, nil, err
		}
		content, err = readGitConfig(path)
		if err != nil {
			return method, nil, fmt.Errorf("failed to read Git config from %s: %w", path, err)
		}
		return method, content, nil

	case MethodCreateNew:
		identity, err := promptGitIdentity(prompter)
		if err != nil {
			return method, nil, err
		}
		content = generateGitConfig(identity)
		return method, content, nil

	case MethodSkip:
		fmt.Println("Skipping Git configuration.")
		fmt.Println()
		return method, nil, nil

	default:
		return MethodSkip, nil, errors.New("invalid Git config method")
	}
}

// transferGitConfig uploads .gitconfig content to the VM via SSH.
// Checks if VM already has .gitconfig and skips if present (FR-015).
// Sets permissions to 0600 on transferred file (FR-018).
func transferGitConfig(client *sshexec.Client, content []byte, user string) error {
	// Check if .gitconfig already exists in VM (FR-014)
	checkCmd := "test -f ~/.gitconfig && echo 'exists' || echo 'missing'"
	result, err := client.Exec(checkCmd)
	if err != nil {
		return fmt.Errorf("failed to check for existing .gitconfig: %w", err)
	}

	if strings.TrimSpace(result) == "exists" {
		// Skip transfer - preserve existing config (FR-015)
		fmt.Println("VM already has Git configuration - preserving existing .gitconfig")
		return nil
	}

	// Transfer the config
	fmt.Println("Transferring Git configuration to VM...")
	if err := client.TransferFile(content, "~/.gitconfig", "0600"); err != nil {
		return fmt.Errorf("failed to transfer Git config: %w", err)
	}

	fmt.Println("✓ Git configuration set up successfully")
	return nil
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

// validateEmail checks if an email has basic valid format per FR-013.
// Returns nil if valid, error with descriptive message if invalid.
func validateEmail(email string) error {
	email = strings.TrimSpace(email)
	if email == "" {
		return errors.New("email cannot be empty")
	}

	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return errors.New("email must contain exactly one @")
	}

	if len(parts[0]) == 0 {
		return errors.New("email must have username before @")
	}

	if len(parts[1]) == 0 || !strings.Contains(parts[1], ".") {
		return errors.New("email must have domain with . after @")
	}

	return nil
}

// readGitConfig reads a .gitconfig file from the specified path.
// The path is expanded (~ → home directory) and validated.
func readGitConfig(path string) ([]byte, error) {
	expandedPath := expandPath(path)

	// Check if file exists and is readable
	info, err := os.Stat(expandedPath)
	if err != nil {
		return nil, err
	}

	// Check if it's a directory
	if info.IsDir() {
		return nil, fmt.Errorf("%s is a directory, not a file", path)
	}

	// Read the file
	content, err := os.ReadFile(expandedPath)
	if err != nil {
		return nil, err
	}

	return content, nil
}

// readDefaultGitConfig is a convenience wrapper for readGitConfig
// that uses the default ~/.gitconfig path.
func readDefaultGitConfig() ([]byte, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	gitconfigPath := filepath.Join(home, ".gitconfig")
	return readGitConfig(gitconfigPath)
}

// generateGitConfig creates a .gitconfig file content from a GitIdentity.
// The generated config contains [user] section with name and email.
func generateGitConfig(identity GitIdentity) []byte {
	config := fmt.Sprintf("[user]\n\tname = %s\n\temail = %s\n", identity.Name, identity.Email)
	return []byte(config)
}

// gitMethodToString converts a GitConfigMethod to a string for config storage.
func gitMethodToString(method GitConfigMethod) string {
	switch method {
	case MethodDefault:
		return "default"
	case MethodCustom:
		return "custom"
	case MethodCreateNew:
		return "create_new"
	case MethodSkip:
		return "skip"
	default:
		return "skip"
	}
}

// stringToGitMethod converts a string from config to a GitConfigMethod.
func stringToGitMethod(s string) GitConfigMethod {
	switch s {
	case "default":
		return MethodDefault
	case "custom":
		return MethodCustom
	case "create_new":
		return MethodCreateNew
	case "skip":
		return MethodSkip
	default:
		return MethodSkip
	}
}

// encodeGitConfig encodes Git config content as base64 for safe YAML storage.
func encodeGitConfig(content []byte) string {
	return base64.StdEncoding.EncodeToString(content)
}

// decodeGitConfig decodes base64-encoded Git config content from YAML storage.
func decodeGitConfig(encoded string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(encoded)
}
