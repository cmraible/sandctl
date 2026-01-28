// Package config handles loading and validating sandctl configuration.
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ProviderConfig holds provider-specific configuration.
type ProviderConfig struct {
	Token      string `yaml:"token"`
	Region     string `yaml:"region,omitempty"`
	ServerType string `yaml:"server_type,omitempty"`
	Image      string `yaml:"image,omitempty"`
	SSHKeyID   int64  `yaml:"ssh_key_id,omitempty"` // Cached provider SSH key ID
}

// Config represents the sandctl configuration.
type Config struct {
	// New provider-based configuration
	DefaultProvider string                    `yaml:"default_provider,omitempty"`
	SSHPublicKey    string                    `yaml:"ssh_public_key,omitempty"`
	Providers       map[string]ProviderConfig `yaml:"providers,omitempty"`

	// SSH key agent mode fields
	SSHKeySource       string `yaml:"ssh_key_source,omitempty"`        // "file" or "agent"
	SSHPublicKeyInline string `yaml:"ssh_public_key_inline,omitempty"` // Agent mode: full public key
	SSHKeyFingerprint  string `yaml:"ssh_key_fingerprint,omitempty"`   // Agent mode: SHA256 fingerprint

	// Git configuration fields
	GitConfigMethod  string `yaml:"git_config_method,omitempty"`  // "default", "custom", "create_new", or "skip"
	GitConfigContent string `yaml:"git_config_content,omitempty"` // Base64-encoded .gitconfig content

	// Legacy fields (for migration detection)
	SpritesToken   string `yaml:"sprites_token,omitempty"`
	OpencodeZenKey string `yaml:"opencode_zen_key,omitempty"`
}

// IsLegacyConfig returns true if this is an old sprites-based config.
func (c *Config) IsLegacyConfig() bool {
	return c.SpritesToken != "" && c.DefaultProvider == ""
}

// GetProviderConfig returns the configuration for a specific provider.
func (c *Config) GetProviderConfig(name string) (*ProviderConfig, bool) {
	if c.Providers == nil {
		return nil, false
	}
	cfg, ok := c.Providers[name]
	if !ok {
		return nil, false
	}
	return &cfg, true
}

// SetProviderSSHKeyID updates the cached SSH key ID for a provider.
func (c *Config) SetProviderSSHKeyID(providerName string, keyID int64) {
	if c.Providers == nil {
		c.Providers = make(map[string]ProviderConfig)
	}
	cfg := c.Providers[providerName]
	cfg.SSHKeyID = keyID
	c.Providers[providerName] = cfg
}

// ExpandSSHPublicKeyPath expands ~ in the SSH public key path.
func (c *Config) ExpandSSHPublicKeyPath() string {
	if c.SSHPublicKey == "" {
		return ""
	}
	if strings.HasPrefix(c.SSHPublicKey, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return c.SSHPublicKey
		}
		return filepath.Join(home, c.SSHPublicKey[2:])
	}
	return c.SSHPublicKey
}

// IsAgentMode returns true if the configuration uses SSH agent for key management.
func (c *Config) IsAgentMode() bool {
	return c.SSHKeySource == "agent"
}

// GetSSHPublicKey returns the SSH public key content.
// For agent mode, it returns the inline key. For file mode, it reads from the file.
func (c *Config) GetSSHPublicKey() (string, error) {
	// Agent mode - return inline key directly
	if c.IsAgentMode() {
		if c.SSHPublicKeyInline == "" {
			return "", &ValidationError{
				Field:   "ssh_public_key_inline",
				Message: "is required when ssh_key_source is 'agent'",
			}
		}
		return c.SSHPublicKeyInline, nil
	}

	// File mode - read from file
	keyPath := c.ExpandSSHPublicKeyPath()
	if keyPath == "" {
		return "", &ValidationError{Field: "ssh_public_key", Message: "is required"}
	}

	data, err := os.ReadFile(keyPath)
	if err != nil {
		return "", fmt.Errorf("failed to read SSH public key: %w", err)
	}

	return strings.TrimSpace(string(data)), nil
}

// DefaultConfigPath returns the default config file path.
func DefaultConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".sandctl/config"
	}
	return filepath.Join(home, ".sandctl", "config")
}

// Load reads and parses the config file from the given path.
func Load(path string) (*Config, error) {
	if path == "" {
		path = DefaultConfigPath()
	}

	// Check if file exists
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return nil, &NotFoundError{Path: path}
	}
	if err != nil {
		return nil, fmt.Errorf("failed to stat config file: %w", err)
	}

	// Validate file permissions (should be 0600)
	mode := info.Mode().Perm()
	if mode&0077 != 0 {
		return nil, &InsecurePermissionsError{
			Path:     path,
			Mode:     mode,
			Expected: os.FileMode(0600),
		}
	}

	// Read file contents
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// Parse YAML
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// Validate config
	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// Validate checks that the config has all required fields.
func (c *Config) Validate() error {
	// Check if this is the new provider-based config
	if c.DefaultProvider != "" {
		return c.validateProviderConfig()
	}

	// Legacy validation for old sprites-based config
	if c.SpritesToken == "" {
		return &ValidationError{Field: "sprites_token", Message: "is required"}
	}

	if c.OpencodeZenKey == "" {
		return &ValidationError{Field: "opencode_zen_key", Message: "is required"}
	}

	return nil
}

// validateProviderConfig validates the new provider-based configuration.
func (c *Config) validateProviderConfig() error {
	// Check default_provider exists in providers map
	if len(c.Providers) == 0 {
		return &ValidationError{Field: "providers", Message: "at least one provider must be configured"}
	}

	if _, ok := c.Providers[c.DefaultProvider]; !ok {
		return &ValidationError{
			Field:   "default_provider",
			Message: fmt.Sprintf("'%s' is not configured in providers", c.DefaultProvider),
		}
	}

	// Validate SSH key configuration
	if err := c.validateSSHKeyConfig(); err != nil {
		return err
	}

	// Validate each provider config
	for name, provCfg := range c.Providers {
		if provCfg.Token == "" {
			return &ValidationError{
				Field:   fmt.Sprintf("providers.%s.token", name),
				Message: "is required",
			}
		}
	}

	return nil
}

// validateSSHKeyConfig validates SSH key configuration based on the source mode.
func (c *Config) validateSSHKeyConfig() error {
	// Check if ssh_key_source is valid
	if c.SSHKeySource != "" && c.SSHKeySource != "file" && c.SSHKeySource != "agent" {
		return &ValidationError{
			Field:   "ssh_key_source",
			Message: "must be 'file' or 'agent'",
		}
	}

	// Agent mode validation
	if c.IsAgentMode() {
		if c.SSHPublicKeyInline == "" {
			return &ValidationError{
				Field:   "ssh_public_key_inline",
				Message: "is required when ssh_key_source is 'agent'",
			}
		}
		if c.SSHKeyFingerprint == "" {
			return &ValidationError{
				Field:   "ssh_key_fingerprint",
				Message: "is required when ssh_key_source is 'agent'",
			}
		}
		// Validate fingerprint format
		if !strings.HasPrefix(c.SSHKeyFingerprint, "SHA256:") {
			return &ValidationError{
				Field:   "ssh_key_fingerprint",
				Message: "must start with 'SHA256:'",
			}
		}
		return nil
	}

	// File mode validation (default)
	if c.SSHPublicKey == "" {
		return &ValidationError{Field: "ssh_public_key", Message: "is required"}
	}

	keyPath := c.ExpandSSHPublicKeyPath()
	if _, err := os.Stat(keyPath); err != nil {
		return &ValidationError{
			Field:   "ssh_public_key",
			Message: fmt.Sprintf("file not found: %s", keyPath),
		}
	}

	return nil
}

// NotFoundError is returned when the config file doesn't exist.
type NotFoundError struct {
	Path string
}

func (e *NotFoundError) Error() string {
	return fmt.Sprintf("config file not found: %s", e.Path)
}

// InsecurePermissionsError is returned when config file has insecure permissions.
type InsecurePermissionsError struct {
	Path     string
	Mode     os.FileMode
	Expected os.FileMode
}

func (e *InsecurePermissionsError) Error() string {
	return fmt.Sprintf(
		"config file %s has insecure permissions %04o, expected %04o",
		e.Path, e.Mode, e.Expected,
	)
}

// ValidationError is returned when config validation fails.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("config validation failed: %s %s", e.Field, e.Message)
}

// SetupInstructions returns instructions for setting up the config file.
func SetupInstructions() string {
	return fmt.Sprintf(`Configuration required.

Run 'sandctl init' to configure your provider credentials, or create
%s manually:

  default_provider: hetzner
  ssh_public_key: ~/.ssh/id_ed25519.pub
  opencode_zen_key: "your-opencode-zen-key"

  providers:
    hetzner:
      token: "your-hetzner-api-token"
      region: ash
      server_type: cpx31
      image: ubuntu-24.04

Get your Hetzner API token at: https://console.hetzner.cloud
Get your Opencode Zen key at: https://opencode.ai/settings

After creating the file, set secure permissions:
  chmod 600 %s
`, DefaultConfigPath(), DefaultConfigPath())
}

// MigrationInstructions returns instructions for migrating from old config.
func MigrationInstructions() string {
	return `Your configuration uses the old Sprites format.

Sprites has been replaced with pluggable VM providers. Run 'sandctl init'
to configure your new provider (Hetzner Cloud).

Your existing opencode_zen_key will be preserved.
`
}
