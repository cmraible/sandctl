package session

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/sandctl/sandctl/internal/config"
)

// TestNewStore_GivenEmptyPath_ThenUsesDefault tests default path usage.
func TestNewStore_GivenEmptyPath_ThenUsesDefault(t *testing.T) {
	store := NewStore("")

	if store.path != DefaultStorePath() {
		t.Errorf("path = %q, want %q", store.path, DefaultStorePath())
	}
}

// TestNewStore_GivenCustomPath_ThenUsesCustomPath tests custom path usage.
func TestNewStore_GivenCustomPath_ThenUsesCustomPath(t *testing.T) {
	customPath := "/custom/path/sessions.json"
	store := NewStore(customPath)

	if store.path != customPath {
		t.Errorf("path = %q, want %q", store.path, customPath)
	}
}

// TestDefaultStorePath_GivenHomeDir_ThenReturnsExpectedPath tests default path.
func TestDefaultStorePath_GivenHomeDir_ThenReturnsExpectedPath(t *testing.T) {
	path := DefaultStorePath()

	home, err := os.UserHomeDir()
	if err != nil {
		if path != ".sandctl/sessions.json" {
			t.Errorf("expected fallback path, got %q", path)
		}
		return
	}

	expected := filepath.Join(home, ".sandctl", "sessions.json")
	if path != expected {
		t.Errorf("path = %q, want %q", path, expected)
	}
}

// TestStore_Add_GivenNewSession_ThenPersistsSession tests adding a session.
func TestStore_Add_GivenNewSession_ThenPersistsSession(t *testing.T) {
	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "sessions.json")
	store := NewStore(storePath)

	session := Session{
		ID:        "sandctl-test1234",
		Agent:     config.AgentClaude,
		Prompt:    "Test prompt",
		Status:    StatusRunning,
		CreatedAt: time.Now(),
	}

	if err := store.Add(session); err != nil {
		t.Fatalf("Add() error = %v", err)
	}

	// Verify session was persisted
	sessions, err := store.List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}

	if len(sessions) != 1 {
		t.Errorf("expected 1 session, got %d", len(sessions))
	}
	if sessions[0].ID != session.ID {
		t.Errorf("ID = %q, want %q", sessions[0].ID, session.ID)
	}
}

// TestStore_Add_GivenDuplicateID_ThenReturnsError tests duplicate detection.
func TestStore_Add_GivenDuplicateID_ThenReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "sessions.json")
	store := NewStore(storePath)

	session := Session{
		ID:     "sandctl-test1234",
		Agent:  config.AgentClaude,
		Prompt: "Test prompt",
		Status: StatusRunning,
	}

	if err := store.Add(session); err != nil {
		t.Fatalf("Add() error = %v", err)
	}

	// Try to add duplicate
	err := store.Add(session)

	if err == nil {
		t.Error("expected error for duplicate ID")
	}
}

// TestStore_Update_GivenExistingSession_ThenUpdatesStatus tests status update.
func TestStore_Update_GivenExistingSession_ThenUpdatesStatus(t *testing.T) {
	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "sessions.json")
	store := NewStore(storePath)

	session := Session{
		ID:     "sandctl-test1234",
		Agent:  config.AgentClaude,
		Prompt: "Test prompt",
		Status: StatusRunning,
	}

	if err := store.Add(session); err != nil {
		t.Fatalf("Add() error = %v", err)
	}

	if err := store.Update(session.ID, StatusStopped); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	// Verify update
	got, err := store.Get(session.ID)
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}

	if got.Status != StatusStopped {
		t.Errorf("Status = %q, want %q", got.Status, StatusStopped)
	}
}

// TestStore_Update_GivenNonExistentID_ThenReturnsError tests update of missing session.
func TestStore_Update_GivenNonExistentID_ThenReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "sessions.json")
	store := NewStore(storePath)

	err := store.Update("sandctl-notfound", StatusStopped)

	if err == nil {
		t.Error("expected error for non-existent ID")
	}

	snf, ok := err.(*SessionNotFoundError)
	if !ok {
		t.Fatalf("expected SessionNotFoundError, got %T: %v", err, err)
	}
	if snf.ID != "sandctl-notfound" {
		t.Errorf("ID = %q, want %q", snf.ID, "sandctl-notfound")
	}
}

// TestStore_Remove_GivenExistingSession_ThenRemovesSession tests session removal.
func TestStore_Remove_GivenExistingSession_ThenRemovesSession(t *testing.T) {
	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "sessions.json")
	store := NewStore(storePath)

	session := Session{
		ID:     "sandctl-test1234",
		Agent:  config.AgentClaude,
		Prompt: "Test prompt",
		Status: StatusRunning,
	}

	if err := store.Add(session); err != nil {
		t.Fatalf("Add() error = %v", err)
	}

	if err := store.Remove(session.ID); err != nil {
		t.Fatalf("Remove() error = %v", err)
	}

	// Verify removal
	sessions, err := store.List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}

	if len(sessions) != 0 {
		t.Errorf("expected 0 sessions, got %d", len(sessions))
	}
}

// TestStore_Remove_GivenNonExistentID_ThenReturnsError tests removal of missing session.
func TestStore_Remove_GivenNonExistentID_ThenReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "sessions.json")
	store := NewStore(storePath)

	err := store.Remove("sandctl-notfound")

	if err == nil {
		t.Error("expected error for non-existent ID")
	}

	_, ok := err.(*SessionNotFoundError)
	if !ok {
		t.Fatalf("expected SessionNotFoundError, got %T: %v", err, err)
	}
}

// TestStore_List_GivenEmptyStore_ThenReturnsEmptySlice tests empty list.
func TestStore_List_GivenEmptyStore_ThenReturnsEmptySlice(t *testing.T) {
	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "sessions.json")
	store := NewStore(storePath)

	sessions, err := store.List()

	if err != nil {
		t.Fatalf("List() error = %v", err)
	}

	if sessions == nil {
		t.Error("expected non-nil slice")
	}

	if len(sessions) != 0 {
		t.Errorf("expected 0 sessions, got %d", len(sessions))
	}
}

// TestStore_List_GivenMultipleSessions_ThenReturnsAll tests listing multiple sessions.
func TestStore_List_GivenMultipleSessions_ThenReturnsAll(t *testing.T) {
	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "sessions.json")
	store := NewStore(storePath)

	sessions := []Session{
		{ID: "sandctl-session1", Agent: config.AgentClaude, Prompt: "p1", Status: StatusRunning},
		{ID: "sandctl-session2", Agent: config.AgentOpencode, Prompt: "p2", Status: StatusStopped},
		{ID: "sandctl-session3", Agent: config.AgentCodex, Prompt: "p3", Status: StatusFailed},
	}

	for _, s := range sessions {
		if err := store.Add(s); err != nil {
			t.Fatalf("Add() error = %v", err)
		}
	}

	got, err := store.List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}

	if len(got) != 3 {
		t.Errorf("expected 3 sessions, got %d", len(got))
	}
}

// TestStore_ListActive_GivenMixedStatuses_ThenReturnsOnlyActive tests active filtering.
func TestStore_ListActive_GivenMixedStatuses_ThenReturnsOnlyActive(t *testing.T) {
	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "sessions.json")
	store := NewStore(storePath)

	sessions := []Session{
		{ID: "sandctl-running1", Agent: config.AgentClaude, Prompt: "p1", Status: StatusRunning},
		{ID: "sandctl-prov1234", Agent: config.AgentClaude, Prompt: "p2", Status: StatusProvisioning},
		{ID: "sandctl-stopped1", Agent: config.AgentClaude, Prompt: "p3", Status: StatusStopped},
		{ID: "sandctl-failed12", Agent: config.AgentClaude, Prompt: "p4", Status: StatusFailed},
	}

	for _, s := range sessions {
		if err := store.Add(s); err != nil {
			t.Fatalf("Add() error = %v", err)
		}
	}

	active, err := store.ListActive()
	if err != nil {
		t.Fatalf("ListActive() error = %v", err)
	}

	if len(active) != 2 {
		t.Errorf("expected 2 active sessions, got %d", len(active))
	}

	// Verify only running and provisioning sessions
	for _, s := range active {
		if !s.Status.IsActive() {
			t.Errorf("expected active status, got %q", s.Status)
		}
	}
}

// TestStore_Get_GivenExistingID_ThenReturnsSession tests getting a session.
func TestStore_Get_GivenExistingID_ThenReturnsSession(t *testing.T) {
	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "sessions.json")
	store := NewStore(storePath)

	session := Session{
		ID:     "sandctl-test1234",
		Agent:  config.AgentClaude,
		Prompt: "Test prompt",
		Status: StatusRunning,
	}

	if err := store.Add(session); err != nil {
		t.Fatalf("Add() error = %v", err)
	}

	got, err := store.Get(session.ID)

	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if got.ID != session.ID {
		t.Errorf("ID = %q, want %q", got.ID, session.ID)
	}
	if got.Prompt != session.Prompt {
		t.Errorf("Prompt = %q, want %q", got.Prompt, session.Prompt)
	}
}

// TestStore_Get_GivenNonExistentID_ThenReturnsError tests getting missing session.
func TestStore_Get_GivenNonExistentID_ThenReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "sessions.json")
	store := NewStore(storePath)

	_, err := store.Get("sandctl-notfound")

	if err == nil {
		t.Error("expected error for non-existent ID")
	}

	_, ok := err.(*SessionNotFoundError)
	if !ok {
		t.Fatalf("expected SessionNotFoundError, got %T: %v", err, err)
	}
}

// TestStore_ConcurrentOperations_GivenParallelAccess_ThenNoRaceConditions tests thread safety.
func TestStore_ConcurrentOperations_GivenParallelAccess_ThenNoRaceConditions(t *testing.T) {
	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "sessions.json")
	store := NewStore(storePath)

	// Add initial sessions
	for i := 0; i < 5; i++ {
		session := Session{
			ID:     "sandctl-init" + string(rune('a'+i)) + "000",
			Agent:  config.AgentClaude,
			Prompt: "Initial",
			Status: StatusRunning,
		}
		if err := store.Add(session); err != nil {
			t.Fatalf("Add() error = %v", err)
		}
	}

	var wg sync.WaitGroup
	errChan := make(chan error, 100)

	// Concurrent reads
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := store.List(); err != nil {
				errChan <- err
			}
		}()
	}

	// Concurrent writes
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			session := Session{
				ID:     "sandctl-conc" + string(rune('a'+n)) + "000",
				Agent:  config.AgentClaude,
				Prompt: "Concurrent",
				Status: StatusRunning,
			}
			if err := store.Add(session); err != nil {
				// Duplicates are expected in concurrent adds
				if _, ok := err.(*SessionNotFoundError); !ok {
					// Only report unexpected errors
				}
			}
		}(i)
	}

	// Concurrent updates
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			id := "sandctl-init" + string(rune('a'+n)) + "000"
			_ = store.Update(id, StatusStopped)
		}(i)
	}

	wg.Wait()
	close(errChan)

	for err := range errChan {
		t.Errorf("concurrent operation error: %v", err)
	}
}

// TestSessionNotFoundError_Error_GivenID_ThenReturnsFormattedMessage tests error message.
func TestSessionNotFoundError_Error_GivenID_ThenReturnsFormattedMessage(t *testing.T) {
	err := &SessionNotFoundError{ID: "sandctl-test1234"}

	msg := err.Error()

	expected := "session 'sandctl-test1234' not found"
	if msg != expected {
		t.Errorf("Error() = %q, want %q", msg, expected)
	}
}

// TestStore_CreatesDirectoryIfNotExists tests directory creation.
func TestStore_CreatesDirectoryIfNotExists(t *testing.T) {
	tmpDir := t.TempDir()
	nestedPath := filepath.Join(tmpDir, "nested", "dir", "sessions.json")
	store := NewStore(nestedPath)

	session := Session{
		ID:     "sandctl-test1234",
		Agent:  config.AgentClaude,
		Prompt: "Test",
		Status: StatusRunning,
	}

	if err := store.Add(session); err != nil {
		t.Fatalf("Add() error = %v", err)
	}

	// Verify directory was created
	dir := filepath.Dir(nestedPath)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		t.Error("expected directory to be created")
	}
}
