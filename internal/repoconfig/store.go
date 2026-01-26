package repoconfig

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

// Store manages repository configuration storage.
type Store struct {
	basePath string
	mu       sync.RWMutex
}

// DefaultReposPath returns the default repository configurations directory.
func DefaultReposPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".sandctl/repos"
	}
	return filepath.Join(home, ".sandctl", "repos")
}

// NewStore creates a new repository configuration store.
func NewStore(basePath string) *Store {
	if basePath == "" {
		basePath = DefaultReposPath()
	}
	return &Store{basePath: basePath}
}

// configPath returns the path to a repo's config.yaml file.
func (s *Store) configPath(normalizedName string) string {
	return filepath.Join(s.basePath, normalizedName, "config.yaml")
}

// scriptPath returns the path to a repo's init.sh file.
func (s *Store) scriptPath(normalizedName string) string {
	return filepath.Join(s.basePath, normalizedName, "init.sh")
}

// repoDir returns the path to a repo's directory.
func (s *Store) repoDir(normalizedName string) string {
	return filepath.Join(s.basePath, normalizedName)
}

// Add creates a new repository configuration with an init script template.
func (s *Store) Add(config RepoConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	normalizedName := NormalizeName(config.OriginalName)
	config.Repo = normalizedName

	// Check if config already exists
	configPath := s.configPath(normalizedName)
	if _, err := os.Stat(configPath); err == nil {
		return &AlreadyExistsError{Repo: config.OriginalName}
	}

	// Create repo directory
	repoDir := s.repoDir(normalizedName)
	if err := os.MkdirAll(repoDir, 0700); err != nil {
		return fmt.Errorf("failed to create repo directory: %w", err)
	}

	// Write config.yaml
	configData, err := yaml.Marshal(&config)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}
	if err := os.WriteFile(configPath, configData, 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	// Write init.sh template (executable)
	scriptContent := GenerateInitScript(config.OriginalName)
	scriptPath := s.scriptPath(normalizedName)
	if err := os.WriteFile(scriptPath, []byte(scriptContent), 0700); err != nil { //nolint:gosec // init scripts need to be executable
		return fmt.Errorf("failed to write init script: %w", err)
	}

	return nil
}

// Get retrieves a repository configuration by name.
func (s *Store) Get(repo string) (*RepoConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	normalizedName := NormalizeName(repo)
	configPath := s.configPath(normalizedName)

	data, err := os.ReadFile(configPath)
	if os.IsNotExist(err) {
		return nil, &NotFoundError{Repo: repo}
	}
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config RepoConfig
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	return &config, nil
}

// List returns all repository configurations.
func (s *Store) List() ([]RepoConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entries, err := os.ReadDir(s.basePath)
	if os.IsNotExist(err) {
		return []RepoConfig{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to read repos directory: %w", err)
	}

	var configs []RepoConfig
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		configPath := s.configPath(entry.Name())
		data, err := os.ReadFile(configPath)
		if err != nil {
			continue // Skip invalid entries
		}

		var config RepoConfig
		if err := yaml.Unmarshal(data, &config); err != nil {
			continue // Skip invalid entries
		}

		configs = append(configs, config)
	}

	return configs, nil
}

// Exists checks if a repository configuration exists.
func (s *Store) Exists(repo string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	normalizedName := NormalizeName(repo)
	configPath := s.configPath(normalizedName)
	_, err := os.Stat(configPath)
	return err == nil
}

// Remove deletes a repository configuration and its init script.
func (s *Store) Remove(repo string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	normalizedName := NormalizeName(repo)
	repoDir := s.repoDir(normalizedName)

	if _, err := os.Stat(repoDir); os.IsNotExist(err) {
		return &NotFoundError{Repo: repo}
	}

	if err := os.RemoveAll(repoDir); err != nil {
		return fmt.Errorf("failed to remove repo directory: %w", err)
	}

	return nil
}

// GetInitScriptPath returns the path to a repo's init script.
// Returns empty string if the config doesn't exist.
func (s *Store) GetInitScriptPath(repo string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	normalizedName := NormalizeName(repo)
	scriptPath := s.scriptPath(normalizedName)

	if _, err := os.Stat(scriptPath); err != nil {
		return ""
	}

	return scriptPath
}

// GetInitScript returns the content of a repo's init script.
func (s *Store) GetInitScript(repo string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	normalizedName := NormalizeName(repo)
	scriptPath := s.scriptPath(normalizedName)

	data, err := os.ReadFile(scriptPath)
	if os.IsNotExist(err) {
		return "", &NotFoundError{Repo: repo}
	}
	if err != nil {
		return "", fmt.Errorf("failed to read init script: %w", err)
	}

	return string(data), nil
}

// Update modifies an existing repository configuration.
func (s *Store) Update(config RepoConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	normalizedName := NormalizeName(config.OriginalName)
	config.Repo = normalizedName
	configPath := s.configPath(normalizedName)

	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return &NotFoundError{Repo: config.OriginalName}
	}

	configData, err := yaml.Marshal(&config)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(configPath, configData, 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// NotFoundError is returned when a repo configuration doesn't exist.
type NotFoundError struct {
	Repo string
}

func (e *NotFoundError) Error() string {
	return fmt.Sprintf("no configuration found for repository '%s'", e.Repo)
}

// AlreadyExistsError is returned when trying to create a config that already exists.
type AlreadyExistsError struct {
	Repo string
}

func (e *AlreadyExistsError) Error() string {
	return fmt.Sprintf("repository '%s' is already configured", e.Repo)
}
