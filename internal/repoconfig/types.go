// Package repoconfig handles repository initialization script configuration.
package repoconfig

import (
	"fmt"
	"time"

	"gopkg.in/yaml.v3"
)

// DefaultTimeout is the default timeout for init script execution.
const DefaultTimeout = 10 * time.Minute

// Duration wraps time.Duration for YAML marshaling.
type Duration struct {
	time.Duration
}

// MarshalYAML implements yaml.Marshaler.
func (d Duration) MarshalYAML() (interface{}, error) {
	return d.String(), nil
}

// UnmarshalYAML implements yaml.Unmarshaler.
func (d *Duration) UnmarshalYAML(value *yaml.Node) error {
	var s string
	if err := value.Decode(&s); err != nil {
		return err
	}
	parsed, err := time.ParseDuration(s)
	if err != nil {
		return fmt.Errorf("invalid duration: %w", err)
	}
	d.Duration = parsed
	return nil
}

// RepoConfig represents a user's initialization configuration for a GitHub repository.
type RepoConfig struct {
	// Repo is the normalized repository identifier (lowercase, owner-repo format).
	Repo string `yaml:"repo"`

	// OriginalName is the original repository name as entered by user (preserves casing).
	OriginalName string `yaml:"original_name"`

	// CreatedAt is when the configuration was created.
	CreatedAt time.Time `yaml:"created_at"`

	// Timeout is the custom timeout for init script execution (default: 10 minutes).
	Timeout Duration `yaml:"timeout,omitempty"`
}

// GetTimeout returns the timeout duration, using default if not set.
func (r *RepoConfig) GetTimeout() time.Duration {
	if r.Timeout.Duration == 0 {
		return DefaultTimeout
	}
	return r.Timeout.Duration
}
