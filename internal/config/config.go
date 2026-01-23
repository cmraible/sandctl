// Package config handles loading and validating sandctl configuration.
package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// AgentType represents the type of AI coding agent.
type AgentType string

const (
	AgentClaude   AgentType = "claude"
	AgentOpencode AgentType = "opencode"
	AgentCodex    AgentType = "codex"
)

// ValidAgentTypes returns all valid agent types.
func ValidAgentTypes() []AgentType {
	return []AgentType{AgentClaude, AgentOpencode, AgentCodex}
}

// IsValid checks if the agent type is valid.
func (a AgentType) IsValid() bool {
	for _, valid := range ValidAgentTypes() {
		if a == valid {
			return true
		}
	}
	return false
}

// Config represents the sandctl configuration.
type Config struct {
	SpritesToken string            `yaml:"sprites_token"`
	DefaultAgent AgentType         `yaml:"default_agent"`
	AgentAPIKeys map[string]string `yaml:"agent_api_keys"`
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

	// Set default agent if not specified
	if c.DefaultAgent == "" {
		c.DefaultAgent = AgentClaude
	}

	if !c.DefaultAgent.IsValid() {
		return &ValidationError{
			Field:   "default_agent",
			Message: fmt.Sprintf("must be one of: %v", ValidAgentTypes()),
		}
	}

	if c.AgentAPIKeys == nil {
		c.AgentAPIKeys = make(map[string]string)
	}

	return nil
}

// GetAPIKey returns the API key for the given agent type.
func (c *Config) GetAPIKey(agent AgentType) (string, bool) {
	key, ok := c.AgentAPIKeys[string(agent)]
	return key, ok && key != ""
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

Create %s with your Sprites token:

  sprites_token: "your-token-here"
  agent_api_keys:
    claude: "your-anthropic-key"

Get your Sprites token at: https://sprites.dev/tokens
Get your Anthropic key at: https://console.anthropic.com/

After creating the file, set secure permissions:
  chmod 600 %s
`, DefaultConfigPath(), DefaultConfigPath())
}
