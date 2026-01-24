package config

import (
	"os"
	"path/filepath"
	"testing"
)

// TestSave_GivenValidConfig_ThenCreatesFileWithCorrectPermissions tests file creation.
func TestSave_GivenValidConfig_ThenCreatesFileWithCorrectPermissions(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	cfg := &Config{
		SpritesToken:   "test-token",
		OpencodeZenKey: "test-zen-key",
	}

	err := Save(configPath, cfg)
	if err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	// Verify file exists
	info, err := os.Stat(configPath)
	if err != nil {
		t.Fatalf("file not created: %v", err)
	}

	// Verify permissions are 0600
	mode := info.Mode().Perm()
	if mode != 0600 {
		t.Errorf("permissions = %04o, want 0600", mode)
	}
}

// TestSave_GivenNestedPath_ThenCreatesDirectory tests directory creation.
func TestSave_GivenNestedPath_ThenCreatesDirectory(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "nested", "dir", "config")

	cfg := &Config{
		SpritesToken:   "test-token",
		OpencodeZenKey: "test-zen-key",
	}

	err := Save(configPath, cfg)
	if err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	// Verify directory was created
	dir := filepath.Dir(configPath)
	info, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("directory not created: %v", err)
	}

	// Verify directory permissions are 0700
	mode := info.Mode().Perm()
	if mode != 0700 {
		t.Errorf("directory permissions = %04o, want 0700", mode)
	}
}

// TestSave_GivenExistingConfig_ThenUpdatesAtomically tests atomic update.
func TestSave_GivenExistingConfig_ThenUpdatesAtomically(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Create initial config
	cfg1 := &Config{
		SpritesToken:   "token-1",
		OpencodeZenKey: "key-1",
	}
	if err := Save(configPath, cfg1); err != nil {
		t.Fatalf("Save() initial error = %v", err)
	}

	// Update config
	cfg2 := &Config{
		SpritesToken:   "token-2",
		OpencodeZenKey: "key-2",
	}
	if err := Save(configPath, cfg2); err != nil {
		t.Fatalf("Save() update error = %v", err)
	}

	// Verify updated content
	loaded, err := Load(configPath)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if loaded.SpritesToken != "token-2" {
		t.Errorf("SpritesToken = %q, want %q", loaded.SpritesToken, "token-2")
	}
	if loaded.OpencodeZenKey != "key-2" {
		t.Errorf("OpencodeZenKey = %q, want %q", loaded.OpencodeZenKey, "key-2")
	}
}

// TestSave_GivenEmptyPath_ThenUsesDefaultPath tests default path behavior.
func TestSave_GivenEmptyPath_ThenUsesDefaultPath(t *testing.T) {
	// This test would modify the user's home directory, so we skip it
	// and just verify the function signature accepts empty string
	t.Skip("Skipping test that would modify user's home directory")
}

// TestSave_GivenValidConfig_ThenWritesYAML tests YAML content.
func TestSave_GivenValidConfig_ThenWritesYAML(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	cfg := &Config{
		SpritesToken:   "test-token",
		OpencodeZenKey: "test-zen-key",
	}

	if err := Save(configPath, cfg); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	// Read and verify YAML content
	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}

	content := string(data)
	if !contains(content, "sprites_token") {
		t.Error("YAML should contain sprites_token")
	}
	if !contains(content, "opencode_zen_key") {
		t.Error("YAML should contain opencode_zen_key")
	}
	// Should NOT contain old fields
	if contains(content, "default_agent") {
		t.Error("YAML should NOT contain default_agent")
	}
	if contains(content, "agent_api_keys") {
		t.Error("YAML should NOT contain agent_api_keys")
	}
}

// TestSaveDefault_GivenConfig_ThenUsesDefaultPath tests SaveDefault.
func TestSaveDefault_GivenConfig_ThenUsesDefaultPath(t *testing.T) {
	// This test would modify the user's home directory, so we skip it
	t.Skip("Skipping test that would modify user's home directory")
}

// TestSave_GivenNoTempFilePermission_ThenReturnsError tests permission errors.
func TestSave_GivenNoTempFilePermission_ThenReturnsError(t *testing.T) {
	// Create a read-only directory
	tmpDir := t.TempDir()
	readOnlyDir := filepath.Join(tmpDir, "readonly")
	if err := os.Mkdir(readOnlyDir, 0500); err != nil {
		t.Fatalf("failed to create read-only dir: %v", err)
	}

	configPath := filepath.Join(readOnlyDir, "config")
	cfg := &Config{SpritesToken: "test", OpencodeZenKey: "test"}

	err := Save(configPath, cfg)
	if err == nil {
		t.Error("expected error for read-only directory")
	}
}

// TestDirectoryCreateError_Error_ThenReturnsFormattedMessage tests error message.
func TestDirectoryCreateError_Error_ThenReturnsFormattedMessage(t *testing.T) {
	err := &DirectoryCreateError{
		Path: "/some/path",
		Err:  os.ErrPermission,
	}

	msg := err.Error()
	if !contains(msg, "/some/path") {
		t.Errorf("error should contain path, got: %q", msg)
	}
}

// TestPermissionError_Error_ThenReturnsFormattedMessage tests error message.
func TestPermissionError_Error_ThenReturnsFormattedMessage(t *testing.T) {
	err := &PermissionError{
		Path: "/some/file",
		Err:  os.ErrPermission,
	}

	msg := err.Error()
	if !contains(msg, "/some/file") {
		t.Errorf("error should contain path, got: %q", msg)
	}
}

// Note: contains helper function is defined in config_test.go
