package session

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// NormalizeName converts a name to lowercase and trims whitespace.
// This ensures case-insensitive matching for session names.
func NormalizeName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// Store manages local session storage.
type Store struct {
	path string
	mu   sync.RWMutex
}

// storeData represents the JSON structure of the sessions file.
type storeData struct {
	Sessions []Session `json:"sessions"`
}

// DefaultStorePath returns the default sessions file path.
func DefaultStorePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".sandctl/sessions.json"
	}
	return filepath.Join(home, ".sandctl", "sessions.json")
}

// NewStore creates a new session store at the given path.
func NewStore(path string) *Store {
	if path == "" {
		path = DefaultStorePath()
	}
	return &Store{path: path}
}

// ensureDir creates the parent directory if it doesn't exist.
func (s *Store) ensureDir() error {
	dir := filepath.Dir(s.path)
	return os.MkdirAll(dir, 0700)
}

// load reads the sessions file and returns the data.
func (s *Store) load() (*storeData, error) {
	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return &storeData{Sessions: []Session{}}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to read sessions file: %w", err)
	}

	var store storeData
	if err := json.Unmarshal(data, &store); err != nil {
		return nil, fmt.Errorf("failed to parse sessions file: %w", err)
	}

	return &store, nil
}

// save writes the sessions data to disk.
func (s *Store) save(data *storeData) error {
	if err := s.ensureDir(); err != nil {
		return fmt.Errorf("failed to create sessions directory: %w", err)
	}

	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal sessions: %w", err)
	}

	if err := os.WriteFile(s.path, jsonData, 0600); err != nil {
		return fmt.Errorf("failed to write sessions file: %w", err)
	}

	return nil
}

// Add appends a new session to the store.
func (s *Store) Add(session Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.load()
	if err != nil {
		return err
	}

	// Normalize the session ID for storage
	session.ID = NormalizeName(session.ID)

	// Check for duplicate ID (case-insensitive)
	for _, existing := range data.Sessions {
		if NormalizeName(existing.ID) == session.ID {
			return fmt.Errorf("session with name '%s' already exists", session.ID)
		}
	}

	data.Sessions = append(data.Sessions, session)
	return s.save(data)
}

// Update modifies an existing session's status.
func (s *Store) Update(id string, status Status) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.load()
	if err != nil {
		return err
	}

	// Normalize input for case-insensitive lookup
	normalizedID := NormalizeName(id)

	found := false
	for i, session := range data.Sessions {
		if NormalizeName(session.ID) == normalizedID {
			data.Sessions[i].Status = status
			found = true
			break
		}
	}

	if !found {
		return &NotFoundError{ID: id}
	}

	return s.save(data)
}

// Remove deletes a session from the store.
func (s *Store) Remove(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.load()
	if err != nil {
		return err
	}

	// Normalize input for case-insensitive lookup
	normalizedID := NormalizeName(id)

	newSessions := make([]Session, 0, len(data.Sessions))
	found := false
	for _, session := range data.Sessions {
		if NormalizeName(session.ID) == normalizedID {
			found = true
			continue
		}
		newSessions = append(newSessions, session)
	}

	if !found {
		return &NotFoundError{ID: id}
	}

	data.Sessions = newSessions
	return s.save(data)
}

// List returns all sessions in the store.
func (s *Store) List() ([]Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.load()
	if err != nil {
		return nil, err
	}

	return data.Sessions, nil
}

// ListActive returns only active sessions (provisioning or running).
func (s *Store) ListActive() ([]Session, error) {
	sessions, err := s.List()
	if err != nil {
		return nil, err
	}

	active := make([]Session, 0)
	for _, session := range sessions {
		if session.Status.IsActive() {
			active = append(active, session)
		}
	}

	return active, nil
}

// Get returns a single session by ID.
func (s *Store) Get(id string) (*Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.load()
	if err != nil {
		return nil, err
	}

	// Normalize input for case-insensitive lookup
	normalizedID := NormalizeName(id)

	for _, session := range data.Sessions {
		if NormalizeName(session.ID) == normalizedID {
			return &session, nil
		}
	}

	return nil, &NotFoundError{ID: id}
}

// GetUsedNames returns a list of all session IDs (names) currently in the store.
// This is used to check for name availability when generating new session names.
func (s *Store) GetUsedNames() ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.load()
	if err != nil {
		return nil, err
	}

	names := make([]string, len(data.Sessions))
	for i, session := range data.Sessions {
		names[i] = session.ID
	}

	return names, nil
}

// NotFoundError is returned when a session doesn't exist.
type NotFoundError struct {
	ID string
}

func (e *NotFoundError) Error() string {
	return fmt.Sprintf("session '%s' not found", e.ID)
}
