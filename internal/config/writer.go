package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Save writes the configuration to the specified path atomically.
// It creates the parent directory if needed with 0700 permissions.
// The config file is created with 0600 permissions.
func Save(path string, cfg *Config) error {
	if path == "" {
		path = DefaultConfigPath()
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return &DirectoryCreateError{Path: dir, Err: err}
	}

	// Create temp file in same directory for atomic rename
	tmp, err := os.CreateTemp(dir, ".config.tmp.*")
	if err != nil {
		return fmt.Errorf("failed to create temporary file: %w", err)
	}
	tmpPath := tmp.Name()

	// Ensure cleanup on any error
	defer func() {
		if tmpPath != "" {
			os.Remove(tmpPath)
		}
	}()

	// Set secure permissions before writing content
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return &PermissionError{Path: tmpPath, Err: err}
	}

	// Write YAML content
	encoder := yaml.NewEncoder(tmp)
	encoder.SetIndent(2)
	if err := encoder.Encode(cfg); err != nil {
		tmp.Close()
		return fmt.Errorf("failed to encode configuration: %w", err)
	}

	if err := encoder.Close(); err != nil {
		tmp.Close()
		return fmt.Errorf("failed to close encoder: %w", err)
	}

	if err := tmp.Close(); err != nil {
		return fmt.Errorf("failed to close temporary file: %w", err)
	}

	// Atomic rename
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("failed to save configuration: %w", err)
	}

	// Clear tmpPath so deferred cleanup doesn't remove the final file
	tmpPath = ""

	return nil
}

// SaveDefault writes the configuration to the default path (~/.sandctl/config).
func SaveDefault(cfg *Config) error {
	return Save(DefaultConfigPath(), cfg)
}

// DirectoryCreateError is returned when the config directory cannot be created.
type DirectoryCreateError struct {
	Path string
	Err  error
}

func (e *DirectoryCreateError) Error() string {
	return fmt.Sprintf("failed to create configuration directory %s: %v", e.Path, e.Err)
}

func (e *DirectoryCreateError) Unwrap() error {
	return e.Err
}

// PermissionError is returned when file permissions cannot be set.
type PermissionError struct {
	Path string
	Err  error
}

func (e *PermissionError) Error() string {
	return fmt.Sprintf("failed to set permissions on %s: %v", e.Path, e.Err)
}

func (e *PermissionError) Unwrap() error {
	return e.Err
}
