// Package config handles loading and validating sandctl configuration.
package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Config represents the sandctl configuration.
type Config struct {
	SpritesToken   string `yaml:"sprites_token"`
	OpencodeZenKey string `yaml:"opencode_zen_key"`
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
	if c.SpritesToken == "" {
		return &ValidationError{Field: "sprites_token", Message: "is required"}
	}

	if c.OpencodeZenKey == "" {
		return &ValidationError{Field: "opencode_zen_key", Message: "is required"}
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

Create %s with your credentials:

  sprites_token: "your-sprites-token"
  opencode_zen_key: "your-opencode-zen-key"

Get your Sprites token at: https://sprites.dev/tokens
Get your Opencode Zen key at: https://opencode.ai/settings

After creating the file, set secure permissions:
  chmod 600 %s
`, DefaultConfigPath(), DefaultConfigPath())
}
