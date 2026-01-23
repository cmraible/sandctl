package config

import (
	"os"
	"path/filepath"
	"testing"
)

// TestAgentType_IsValid_GivenValidAgent_ThenReturnsTrue tests valid agent types.
func TestAgentType_IsValid_GivenValidAgent_ThenReturnsTrue(t *testing.T) {
	tests := []struct {
		name  string
		agent AgentType
	}{
		{"claude", AgentClaude},
		{"opencode", AgentOpencode},
		{"codex", AgentCodex},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !tt.agent.IsValid() {
				t.Errorf("expected %q to be valid", tt.agent)
			}
		})
	}
}

// TestAgentType_IsValid_GivenInvalidAgent_ThenReturnsFalse tests invalid agent types.
func TestAgentType_IsValid_GivenInvalidAgent_ThenReturnsFalse(t *testing.T) {
	invalidAgents := []AgentType{"invalid", "gpt4", "", "CLAUDE"}

	for _, agent := range invalidAgents {
		t.Run(string(agent), func(t *testing.T) {
			if agent.IsValid() {
				t.Errorf("expected %q to be invalid", agent)
			}
		})
	}
}

// TestValidAgentTypes_GivenCall_ThenReturnsAllAgents verifies all agent types are returned.
func TestValidAgentTypes_GivenCall_ThenReturnsAllAgents(t *testing.T) {
	agents := ValidAgentTypes()

	if len(agents) != 3 {
		t.Errorf("expected 3 agents, got %d", len(agents))
	}

	expected := map[AgentType]bool{AgentClaude: false, AgentOpencode: false, AgentCodex: false}
	for _, agent := range agents {
		if _, ok := expected[agent]; !ok {
			t.Errorf("unexpected agent type: %q", agent)
		}
		expected[agent] = true
	}

	for agent, found := range expected {
		if !found {
			t.Errorf("missing agent type: %q", agent)
		}
	}
}

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
default_agent: claude
agent_api_keys:
  claude: "anthropic-key"
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
	if cfg.DefaultAgent != AgentClaude {
		t.Errorf("DefaultAgent = %q, want %q", cfg.DefaultAgent, AgentClaude)
	}
	if key, ok := cfg.AgentAPIKeys["claude"]; !ok || key != "anthropic-key" {
		t.Errorf("AgentAPIKeys[claude] = %q, want %q", key, "anthropic-key")
	}
}

// TestLoad_GivenMissingFile_ThenReturnsConfigNotFoundError tests missing file error.
func TestLoad_GivenMissingFile_ThenReturnsConfigNotFoundError(t *testing.T) {
	_, err := Load("/nonexistent/path/config")

	if err == nil {
		t.Fatal("expected error for missing file")
	}

	cnf, ok := err.(*ConfigNotFoundError)
	if !ok {
		t.Fatalf("expected ConfigNotFoundError, got %T: %v", err, err)
	}

	if cnf.Path != "/nonexistent/path/config" {
		t.Errorf("Path = %q, want %q", cnf.Path, "/nonexistent/path/config")
	}
}

// TestLoad_GivenInsecurePermissions_ThenReturnsInsecurePermissionsError tests permission check.
func TestLoad_GivenInsecurePermissions_ThenReturnsInsecurePermissionsError(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	content := `sprites_token: "token"`
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

	// Should be ConfigNotFoundError pointing to default path
	cnf, ok := err.(*ConfigNotFoundError)
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
		SpritesToken: "",
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

// TestValidate_GivenInvalidAgent_ThenReturnsValidationError tests agent validation.
func TestValidate_GivenInvalidAgent_ThenReturnsValidationError(t *testing.T) {
	cfg := &Config{
		SpritesToken: "token",
		DefaultAgent: "invalid-agent",
	}

	err := cfg.Validate()

	if err == nil {
		t.Fatal("expected error for invalid agent")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError, got %T: %v", err, err)
	}

	if ve.Field != "default_agent" {
		t.Errorf("Field = %q, want %q", ve.Field, "default_agent")
	}
}

// TestValidate_GivenEmptyAgent_ThenSetsDefault tests default agent assignment.
func TestValidate_GivenEmptyAgent_ThenSetsDefault(t *testing.T) {
	cfg := &Config{
		SpritesToken: "token",
		DefaultAgent: "",
	}

	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}

	if cfg.DefaultAgent != AgentClaude {
		t.Errorf("DefaultAgent = %q, want %q", cfg.DefaultAgent, AgentClaude)
	}
}

// TestValidate_GivenNilAPIKeys_ThenInitializesMap tests API keys initialization.
func TestValidate_GivenNilAPIKeys_ThenInitializesMap(t *testing.T) {
	cfg := &Config{
		SpritesToken: "token",
		AgentAPIKeys: nil,
	}

	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}

	if cfg.AgentAPIKeys == nil {
		t.Error("expected AgentAPIKeys to be initialized")
	}
}

// TestGetAPIKey_GivenExistingKey_ThenReturnsKey tests retrieving existing keys.
func TestGetAPIKey_GivenExistingKey_ThenReturnsKey(t *testing.T) {
	cfg := &Config{
		AgentAPIKeys: map[string]string{
			"claude": "anthropic-key-123",
		},
	}

	key, ok := cfg.GetAPIKey(AgentClaude)

	if !ok {
		t.Error("expected key to exist")
	}
	if key != "anthropic-key-123" {
		t.Errorf("key = %q, want %q", key, "anthropic-key-123")
	}
}

// TestGetAPIKey_GivenMissingKey_ThenReturnsFalse tests missing key handling.
func TestGetAPIKey_GivenMissingKey_ThenReturnsFalse(t *testing.T) {
	cfg := &Config{
		AgentAPIKeys: map[string]string{},
	}

	_, ok := cfg.GetAPIKey(AgentClaude)

	if ok {
		t.Error("expected key to not exist")
	}
}

// TestGetAPIKey_GivenEmptyKey_ThenReturnsFalse tests empty key handling.
func TestGetAPIKey_GivenEmptyKey_ThenReturnsFalse(t *testing.T) {
	cfg := &Config{
		AgentAPIKeys: map[string]string{
			"claude": "",
		},
	}

	_, ok := cfg.GetAPIKey(AgentClaude)

	if ok {
		t.Error("expected empty key to return false")
	}
}

// TestConfigNotFoundError_Error_GivenPath_ThenReturnsFormattedMessage tests error message.
func TestConfigNotFoundError_Error_GivenPath_ThenReturnsFormattedMessage(t *testing.T) {
	err := &ConfigNotFoundError{Path: "/some/path/config"}

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

	// Should contain key elements
	if !contains(instructions, "sprites_token") {
		t.Error("instructions should mention sprites_token")
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
