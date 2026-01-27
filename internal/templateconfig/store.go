package templateconfig

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// Store manages template configuration storage.
type Store struct {
	basePath string
	mu       sync.RWMutex
}

// DefaultTemplatesPath returns the default templates directory.
func DefaultTemplatesPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".sandctl/templates"
	}
	return filepath.Join(home, ".sandctl", "templates")
}

// NewStore creates a new template configuration store.
func NewStore() (*Store, error) {
	basePath := DefaultTemplatesPath()
	return &Store{basePath: basePath}, nil
}

// configPath returns the path to a template's config.yaml file.
func (s *Store) configPath(normalizedName string) string {
	return filepath.Join(s.basePath, normalizedName, "config.yaml")
}

// scriptPath returns the path to a template's init.sh file.
func (s *Store) scriptPath(normalizedName string) string {
	return filepath.Join(s.basePath, normalizedName, "init.sh")
}

// templateDir returns the path to a template's directory.
func (s *Store) templateDir(normalizedName string) string {
	return filepath.Join(s.basePath, normalizedName)
}

// Add creates a new template with a default init script.
func (s *Store) Add(name string) (*TemplateConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if name == "" {
		return nil, fmt.Errorf("template name is required")
	}

	normalizedName := NormalizeName(name)
	if normalizedName == "" {
		return nil, fmt.Errorf("template name is required")
	}

	// Check if config already exists
	configPath := s.configPath(normalizedName)
	if _, err := os.Stat(configPath); err == nil {
		return nil, &AlreadyExistsError{Template: name}
	}

	// Create config
	config := &TemplateConfig{
		Template:     normalizedName,
		OriginalName: name,
		CreatedAt:    time.Now().UTC(),
	}

	// Create template directory
	templateDir := s.templateDir(normalizedName)
	if err := os.MkdirAll(templateDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create template directory: %w", err)
	}

	// Write config.yaml
	configData, err := yaml.Marshal(config)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal config: %w", err)
	}
	if err := os.WriteFile(configPath, configData, 0600); err != nil {
		return nil, fmt.Errorf("failed to write config file: %w", err)
	}

	// Write init.sh template (executable)
	scriptContent := GenerateInitScript(name)
	scriptPath := s.scriptPath(normalizedName)
	if err := os.WriteFile(scriptPath, []byte(scriptContent), 0700); err != nil { //nolint:gosec // init scripts need to be executable
		return nil, fmt.Errorf("failed to write init script: %w", err)
	}

	return config, nil
}

// Get retrieves a template by name (case-insensitive).
func (s *Store) Get(name string) (*TemplateConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	normalizedName := NormalizeName(name)
	configPath := s.configPath(normalizedName)

	data, err := os.ReadFile(configPath)
	if os.IsNotExist(err) {
		return nil, &NotFoundError{Template: name}
	}
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config TemplateConfig
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	return &config, nil
}

// List returns all configured templates.
func (s *Store) List() ([]*TemplateConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entries, err := os.ReadDir(s.basePath)
	if os.IsNotExist(err) {
		return []*TemplateConfig{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to read templates directory: %w", err)
	}

	var configs []*TemplateConfig
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		configPath := s.configPath(entry.Name())
		data, err := os.ReadFile(configPath)
		if err != nil {
			continue // Skip invalid entries
		}

		var config TemplateConfig
		if err := yaml.Unmarshal(data, &config); err != nil {
			continue // Skip invalid entries
		}

		configs = append(configs, &config)
	}

	return configs, nil
}

// Remove deletes a template's directory.
func (s *Store) Remove(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	normalizedName := NormalizeName(name)
	templateDir := s.templateDir(normalizedName)

	if _, err := os.Stat(templateDir); os.IsNotExist(err) {
		return &NotFoundError{Template: name}
	}

	if err := os.RemoveAll(templateDir); err != nil {
		return fmt.Errorf("failed to remove template directory: %w", err)
	}

	return nil
}

// Exists checks if a template exists (case-insensitive).
func (s *Store) Exists(name string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	normalizedName := NormalizeName(name)
	configPath := s.configPath(normalizedName)
	_, err := os.Stat(configPath)
	return err == nil
}

// GetInitScript returns the content of a template's init script.
func (s *Store) GetInitScript(name string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	normalizedName := NormalizeName(name)
	scriptPath := s.scriptPath(normalizedName)

	data, err := os.ReadFile(scriptPath)
	if os.IsNotExist(err) {
		return "", &NotFoundError{Template: name}
	}
	if err != nil {
		return "", fmt.Errorf("failed to read init script: %w", err)
	}

	return string(data), nil
}

// GetInitScriptPath returns the filesystem path to a template's init.sh.
func (s *Store) GetInitScriptPath(name string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	normalizedName := NormalizeName(name)
	scriptPath := s.scriptPath(normalizedName)

	if _, err := os.Stat(scriptPath); err != nil {
		return "", &NotFoundError{Template: name}
	}

	return scriptPath, nil
}

// NotFoundError is returned when a template doesn't exist.
type NotFoundError struct {
	Template string
}

func (e *NotFoundError) Error() string {
	return fmt.Sprintf("template '%s' not found", e.Template)
}

// AlreadyExistsError is returned when trying to create a template that already exists.
type AlreadyExistsError struct {
	Template string
}

func (e *AlreadyExistsError) Error() string {
	return fmt.Sprintf("template '%s' already exists", e.Template)
}
