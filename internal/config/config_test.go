package config

import (
	"os"
	"path/filepath"
	"testing"
)

// TestDefaultConfigPath_GivenHomeDir_ThenReturnsExpectedPath verifies the default path.
func TestDefaultConfigPath_GivenHomeDir_ThenReturnsExpectedPath(t *testing.T) {
	path := DefaultConfigPath()

	home, err := os.UserHomeDir()
	if err != nil {
		// Falls back to relative path
		if path != ".sandctl/config" {
			t.Errorf("expected fallback path, got %q", path)
		}
		return
	}

	expected := filepath.Join(home, ".sandctl", "config")
	if path != expected {
		t.Errorf("expected %q, got %q", expected, path)
	}
}

// TestLoad_GivenValidConfig_ThenReturnsConfig tests loading a valid config file.
func TestLoad_GivenValidConfig_ThenReturnsConfig(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	content := `sprites_token: "test-token-123"
opencode_zen_key: "zen-key-456"
`
	if err := os.WriteFile(configPath, []byte(content), 0600); err != nil {
		t.Fatalf("failed to write config: %v", err)
	}

	cfg, err := Load(configPath)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.SpritesToken != "test-token-123" {
		t.Errorf("SpritesToken = %q, want %q", cfg.SpritesToken, "test-token-123")
	}
	if cfg.OpencodeZenKey != "zen-key-456" {
		t.Errorf("OpencodeZenKey = %q, want %q", cfg.OpencodeZenKey, "zen-key-456")
	}
}

// TestLoad_GivenMissingFile_ThenReturnsNotFoundError tests missing file error.
func TestLoad_GivenMissingFile_ThenReturnsNotFoundError(t *testing.T) {
	_, err := Load("/nonexistent/path/config")

	if err == nil {
		t.Fatal("expected error for missing file")
	}

	cnf, ok := err.(*NotFoundError)
	if !ok {
		t.Fatalf("expected NotFoundError, got %T: %v", err, err)
	}

	if cnf.Path != "/nonexistent/path/config" {
		t.Errorf("Path = %q, want %q", cnf.Path, "/nonexistent/path/config")
	}
}

// TestLoad_GivenInsecurePermissions_ThenReturnsInsecurePermissionsError tests permission check.
func TestLoad_GivenInsecurePermissions_ThenReturnsInsecurePermissionsError(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	content := `sprites_token: "token"
opencode_zen_key: "key"
`
	// Write with world-readable permissions
	if err := os.WriteFile(configPath, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write config: %v", err)
	}

	_, err := Load(configPath)

	if err == nil {
		t.Fatal("expected error for insecure permissions")
	}

	ipe, ok := err.(*InsecurePermissionsError)
	if !ok {
		t.Fatalf("expected InsecurePermissionsError, got %T: %v", err, err)
	}

	if ipe.Mode&0077 == 0 {
		t.Errorf("expected insecure mode, got %04o", ipe.Mode)
	}
}

// TestLoad_GivenInvalidYAML_ThenReturnsParseError tests invalid YAML handling.
func TestLoad_GivenInvalidYAML_ThenReturnsParseError(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	content := `not: valid: yaml: content`
	if err := os.WriteFile(configPath, []byte(content), 0600); err != nil {
		t.Fatalf("failed to write config: %v", err)
	}

	_, err := Load(configPath)

	if err == nil {
		t.Fatal("expected error for invalid YAML")
	}
}

// TestLoad_GivenEmptyPath_ThenUsesDefaultPath tests empty path handling.
func TestLoad_GivenEmptyPath_ThenUsesDefaultPath(t *testing.T) {
	// This will fail since default path likely doesn't exist, but verifies the code path
	_, err := Load("")

	if err == nil {
		// Config might exist on system
		return
	}

	// Should be NotFoundError pointing to default path
	cnf, ok := err.(*NotFoundError)
	if !ok {
		// Could be other error if config exists but has issues
		return
	}

	if cnf.Path != DefaultConfigPath() {
		t.Errorf("Path = %q, want %q", cnf.Path, DefaultConfigPath())
	}
}

// TestValidate_GivenMissingToken_ThenReturnsValidationError tests token requirement.
func TestValidate_GivenMissingToken_ThenReturnsValidationError(t *testing.T) {
	cfg := &Config{
		SpritesToken:   "",
		OpencodeZenKey: "zen-key",
	}

	err := cfg.Validate()

	if err == nil {
		t.Fatal("expected error for missing token")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError, got %T: %v", err, err)
	}

	if ve.Field != "sprites_token" {
		t.Errorf("Field = %q, want %q", ve.Field, "sprites_token")
	}
}

// TestValidate_GivenMissingZenKey_ThenReturnsValidationError tests zen key requirement.
func TestValidate_GivenMissingZenKey_ThenReturnsValidationError(t *testing.T) {
	cfg := &Config{
		SpritesToken:   "token",
		OpencodeZenKey: "",
	}

	err := cfg.Validate()

	if err == nil {
		t.Fatal("expected error for missing zen key")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError, got %T: %v", err, err)
	}

	if ve.Field != "opencode_zen_key" {
		t.Errorf("Field = %q, want %q", ve.Field, "opencode_zen_key")
	}
}

// TestValidate_GivenValidConfig_ThenReturnsNoError tests valid config validation.
func TestValidate_GivenValidConfig_ThenReturnsNoError(t *testing.T) {
	cfg := &Config{
		SpritesToken:   "token",
		OpencodeZenKey: "zen-key",
	}

	err := cfg.Validate()

	if err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

// TestNotFoundError_Error_GivenPath_ThenReturnsFormattedMessage tests error message.
func TestNotFoundError_Error_GivenPath_ThenReturnsFormattedMessage(t *testing.T) {
	err := &NotFoundError{Path: "/some/path/config"}

	msg := err.Error()

	if msg != "config file not found: /some/path/config" {
		t.Errorf("Error() = %q", msg)
	}
}

// TestInsecurePermissionsError_Error_GivenValues_ThenReturnsFormattedMessage tests error message.
func TestInsecurePermissionsError_Error_GivenValues_ThenReturnsFormattedMessage(t *testing.T) {
	err := &InsecurePermissionsError{
		Path:     "/path/to/config",
		Mode:     0644,
		Expected: 0600,
	}

	msg := err.Error()

	expected := "config file /path/to/config has insecure permissions 0644, expected 0600"
	if msg != expected {
		t.Errorf("Error() = %q, want %q", msg, expected)
	}
}

// TestValidationError_Error_GivenFieldAndMessage_ThenReturnsFormattedMessage tests error message.
func TestValidationError_Error_GivenFieldAndMessage_ThenReturnsFormattedMessage(t *testing.T) {
	err := &ValidationError{
		Field:   "sprites_token",
		Message: "is required",
	}

	msg := err.Error()

	expected := "config validation failed: sprites_token is required"
	if msg != expected {
		t.Errorf("Error() = %q, want %q", msg, expected)
	}
}

// TestSetupInstructions_GivenCall_ThenReturnsInstructions verifies setup instructions.
func TestSetupInstructions_GivenCall_ThenReturnsInstructions(t *testing.T) {
	instructions := SetupInstructions()

	if instructions == "" {
		t.Error("expected non-empty instructions")
	}

	// Should contain key elements for new provider config
	if !contains(instructions, "default_provider") {
		t.Error("instructions should mention default_provider")
	}
	if !contains(instructions, "hetzner") {
		t.Error("instructions should mention hetzner")
	}
	if !contains(instructions, "chmod 600") {
		t.Error("instructions should mention chmod")
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
