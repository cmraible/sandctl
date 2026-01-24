package cli

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestInitCommand_GivenNoExistingConfig_ThenCreatesConfig tests that init creates config file.
func TestInitCommand_GivenNoExistingConfig_ThenCreatesConfig(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Simulate user input: sprites token, zen key
	input := "test-sprites-token\ntest-zen-key\n"

	err := runInitWithInput(configPath, input)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	// Verify config file was created
	if _, statErr := os.Stat(configPath); os.IsNotExist(statErr) {
		t.Error("config file was not created")
	}

	// Verify config content
	cfg, err := loadConfigIgnorePerms(configPath)
	if err != nil {
		t.Fatalf("failed to load created config: %v", err)
	}

	if cfg.SpritesToken != "test-sprites-token" {
		t.Errorf("SpritesToken = %q, want %q", cfg.SpritesToken, "test-sprites-token")
	}
	if cfg.OpencodeZenKey != "test-zen-key" {
		t.Errorf("OpencodeZenKey = %q, want %q", cfg.OpencodeZenKey, "test-zen-key")
	}
}

// TestInitCommand_GivenInteractiveMode_ThenPromptsForTwoValues tests prompts.
func TestInitCommand_GivenInteractiveMode_ThenPromptsForTwoValues(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	var outputBuf bytes.Buffer
	input := "my-token\nmy-zen-key\n"

	err := runInitWithIO(configPath, strings.NewReader(input), &outputBuf)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	output := outputBuf.String()

	// Should prompt for Sprites token
	if !strings.Contains(output, "Sprites") || !strings.Contains(output, "token") {
		t.Error("should prompt for Sprites token")
	}

	// Should prompt for Opencode Zen key
	if !strings.Contains(output, "Opencode") || !strings.Contains(output, "Zen") {
		t.Error("should prompt for Opencode Zen key")
	}

	// Should NOT prompt for agent selection (removed)
	if strings.Contains(output, "claude") || strings.Contains(output, "codex") {
		t.Error("should NOT prompt for agent selection")
	}
}

// TestInitCommand_GivenValidInput_ThenCreatesFileWithSecurePermissions tests file permissions.
func TestInitCommand_GivenValidInput_ThenCreatesFileWithSecurePermissions(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	input := "test-token\ntest-key\n"

	err := runInitWithInput(configPath, input)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	// Verify file permissions
	info, err := os.Stat(configPath)
	if err != nil {
		t.Fatalf("failed to stat config file: %v", err)
	}

	mode := info.Mode().Perm()
	if mode != 0600 {
		t.Errorf("file permissions = %04o, want 0600", mode)
	}
}

// TestInitCommand_GivenExistingConfig_ThenLoadsAsDefaults tests loading existing config.
func TestInitCommand_GivenExistingConfig_ThenLoadsAsDefaults(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Create existing config
	existingContent := `sprites_token: "existing-token"
opencode_zen_key: "existing-key"
`
	if err := os.WriteFile(configPath, []byte(existingContent), 0600); err != nil {
		t.Fatalf("failed to create existing config: %v", err)
	}

	// Run init with empty inputs (press Enter to keep defaults)
	var outputBuf bytes.Buffer
	input := "\n\n"

	err := runInitWithIO(configPath, strings.NewReader(input), &outputBuf)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	// Verify existing values are preserved
	cfg, err := loadConfigIgnorePerms(configPath)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.SpritesToken != "existing-token" {
		t.Errorf("SpritesToken = %q, want %q (preserved)", cfg.SpritesToken, "existing-token")
	}
	if cfg.OpencodeZenKey != "existing-key" {
		t.Errorf("OpencodeZenKey = %q, want %q (preserved)", cfg.OpencodeZenKey, "existing-key")
	}
}

// TestInitCommand_GivenEnterOnAllPrompts_ThenPreservesExistingValues tests value preservation.
func TestInitCommand_GivenEnterOnAllPrompts_ThenPreservesExistingValues(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Create existing config
	existingContent := `sprites_token: "preserve-me"
opencode_zen_key: "preserve-key"
`
	if err := os.WriteFile(configPath, []byte(existingContent), 0600); err != nil {
		t.Fatalf("failed to create existing config: %v", err)
	}

	// Press Enter on all prompts
	input := "\n\n"

	err := runInitWithInput(configPath, input)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	cfg, err := loadConfigIgnorePerms(configPath)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.SpritesToken != "preserve-me" {
		t.Errorf("SpritesToken = %q, want %q", cfg.SpritesToken, "preserve-me")
	}
	if cfg.OpencodeZenKey != "preserve-key" {
		t.Errorf("OpencodeZenKey = %q, want %q", cfg.OpencodeZenKey, "preserve-key")
	}
}

// TestInitCommand_GivenNewInput_ThenReplacesExistingValues tests value replacement.
func TestInitCommand_GivenNewInput_ThenReplacesExistingValues(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Create existing config
	existingContent := `sprites_token: "old-token"
opencode_zen_key: "old-key"
`
	if err := os.WriteFile(configPath, []byte(existingContent), 0600); err != nil {
		t.Fatalf("failed to create existing config: %v", err)
	}

	// Provide new values
	input := "new-token\nnew-key\n"

	err := runInitWithInput(configPath, input)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	cfg, err := loadConfigIgnorePerms(configPath)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.SpritesToken != "new-token" {
		t.Errorf("SpritesToken = %q, want %q", cfg.SpritesToken, "new-token")
	}
	if cfg.OpencodeZenKey != "new-key" {
		t.Errorf("OpencodeZenKey = %q, want %q", cfg.OpencodeZenKey, "new-key")
	}
}

// TestInitCommand_GivenSuccessfulSave_ThenShowsSuccessMessage tests success message.
func TestInitCommand_GivenSuccessfulSave_ThenShowsSuccessMessage(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	var outputBuf bytes.Buffer
	input := "token\nkey\n"

	err := runInitWithIO(configPath, strings.NewReader(input), &outputBuf)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	output := outputBuf.String()

	// Should show success message
	if !strings.Contains(output, "Configuration saved") && !strings.Contains(output, "success") {
		t.Errorf("should show success message, got: %q", output)
	}
}

// TestInitCommand_GivenSuccess_ThenShowsNextSteps tests next steps display.
func TestInitCommand_GivenSuccess_ThenShowsNextSteps(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	var outputBuf bytes.Buffer
	input := "token\nkey\n"

	err := runInitWithIO(configPath, strings.NewReader(input), &outputBuf)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	output := outputBuf.String()

	// Should show next steps with sandctl start command
	if !strings.Contains(output, "sandctl start") {
		t.Errorf("should show next steps with sandctl start, got: %q", output)
	}
}

// TestInitCommand_GivenConfigWithNoDefaultAgentField_ThenSavesCorrectly tests new format.
func TestInitCommand_GivenConfigWithNoDefaultAgentField_ThenSavesCorrectly(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	input := "my-token\nmy-zen-key\n"

	err := runInitWithInput(configPath, input)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	// Read raw config to verify structure
	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("failed to read config: %v", err)
	}

	configStr := string(data)

	// Should NOT contain default_agent or agent_api_keys
	if strings.Contains(configStr, "default_agent") {
		t.Error("config should NOT contain default_agent field")
	}
	if strings.Contains(configStr, "agent_api_keys") {
		t.Error("config should NOT contain agent_api_keys field")
	}

	// Should contain opencode_zen_key
	if !strings.Contains(configStr, "opencode_zen_key") {
		t.Error("config should contain opencode_zen_key field")
	}
}

// Tests for non-interactive mode (User Story 3)

// TestInitCommand_GivenSpritesTokenAndZenKeyFlags_ThenSkipsPrompts tests non-interactive mode.
func TestInitCommand_GivenSpritesTokenAndZenKeyFlags_ThenSkipsPrompts(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Should succeed without any input prompts
	err := runNonInteractiveInitTest(configPath, "flag-token", "flag-zen-key")
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	// Verify config was created
	if _, statErr := os.Stat(configPath); os.IsNotExist(statErr) {
		t.Error("config file was not created")
	}

	cfg, err := loadConfigIgnorePerms(configPath)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.SpritesToken != "flag-token" {
		t.Errorf("SpritesToken = %q, want %q", cfg.SpritesToken, "flag-token")
	}
	if cfg.OpencodeZenKey != "flag-zen-key" {
		t.Errorf("OpencodeZenKey = %q, want %q", cfg.OpencodeZenKey, "flag-zen-key")
	}
}

// TestInitCommand_GivenMissingSpritesToken_ThenReturnsError tests missing token error.
func TestInitCommand_GivenMissingSpritesToken_ThenReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	err := runNonInteractiveInitTest(configPath, "", "zen-key")
	if err == nil {
		t.Error("expected error for missing --sprites-token")
	}
	if !strings.Contains(err.Error(), "sprites-token") {
		t.Errorf("error should mention sprites-token, got: %v", err)
	}
}

// TestInitCommand_GivenMissingZenKey_ThenReturnsError tests missing zen key error.
func TestInitCommand_GivenMissingZenKey_ThenReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	err := runNonInteractiveInitTest(configPath, "token", "")
	if err == nil {
		t.Error("expected error for missing --opencode-zen-key")
	}
	if !strings.Contains(err.Error(), "opencode-zen-key") {
		t.Errorf("error should mention opencode-zen-key, got: %v", err)
	}
}

// Tests for migration from old config format (User Story 4)

// TestInitCommand_GivenOldConfigFormat_ThenPreservesSpritesToken tests migration.
func TestInitCommand_GivenOldConfigFormat_ThenPreservesSpritesToken(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Create old-format config
	oldContent := `sprites_token: "preserve-this-token"
default_agent: claude
agent_api_keys:
  claude: "old-key"
`
	if err := os.WriteFile(configPath, []byte(oldContent), 0600); err != nil {
		t.Fatalf("failed to create old config: %v", err)
	}

	// Run init - should preserve sprites_token, prompt for zen key
	input := "\nnew-zen-key\n"

	err := runInitWithInput(configPath, input)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	cfg, err := loadConfigIgnorePerms(configPath)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	// Sprites token should be preserved
	if cfg.SpritesToken != "preserve-this-token" {
		t.Errorf("SpritesToken = %q, want %q (preserved from old config)", cfg.SpritesToken, "preserve-this-token")
	}

	// Zen key should be the new value
	if cfg.OpencodeZenKey != "new-zen-key" {
		t.Errorf("OpencodeZenKey = %q, want %q", cfg.OpencodeZenKey, "new-zen-key")
	}
}

// TestInitCommand_GivenOldConfigFormat_ThenRemovesOldFields tests migration cleanup.
func TestInitCommand_GivenOldConfigFormat_ThenRemovesOldFields(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Create old-format config
	oldContent := `sprites_token: "token"
default_agent: codex
agent_api_keys:
  codex: "old-codex-key"
  claude: "old-claude-key"
`
	if err := os.WriteFile(configPath, []byte(oldContent), 0600); err != nil {
		t.Fatalf("failed to create old config: %v", err)
	}

	// Run init
	input := "\nnew-zen-key\n"

	err := runInitWithInput(configPath, input)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	// Read raw config to verify old fields are removed
	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("failed to read config: %v", err)
	}

	configStr := string(data)

	if strings.Contains(configStr, "default_agent") {
		t.Error("config should NOT contain default_agent after migration")
	}
	if strings.Contains(configStr, "agent_api_keys") {
		t.Error("config should NOT contain agent_api_keys after migration")
	}
	if strings.Contains(configStr, "codex") {
		t.Error("config should NOT contain old agent references after migration")
	}
}

// Helper functions for testing

// runInitWithInput runs the init command with the given input string.
func runInitWithInput(configPath, input string) error {
	var outputBuf bytes.Buffer
	return runInitWithIO(configPath, strings.NewReader(input), &outputBuf)
}

// runInitWithIO runs the init command with custom input/output.
func runInitWithIO(configPath string, input *strings.Reader, output *bytes.Buffer) error {
	return runInitFlow(configPath, input, output)
}

// runNonInteractiveInitTest runs the init command with flags (non-interactive mode).
func runNonInteractiveInitTest(configPath, token, zenKey string) error {
	// Save and restore global flag state
	oldToken := initSpritesToken
	oldZenKey := initOpencodeZenKey
	defer func() {
		initSpritesToken = oldToken
		initOpencodeZenKey = oldZenKey
	}()

	initSpritesToken = token
	initOpencodeZenKey = zenKey

	return runNonInteractiveInit(configPath)
}

// loadConfigIgnorePerms loads config without permission checks (for testing).
func loadConfigIgnorePerms(path string) (*configData, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg configData
	if err := unmarshalYAML(data, &cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// configData is a test-only struct for loading config without validation.
type configData struct {
	SpritesToken   string `yaml:"sprites_token"`
	OpencodeZenKey string `yaml:"opencode_zen_key"`
}
