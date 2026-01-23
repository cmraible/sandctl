package cli

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sandctl/sandctl/internal/config"
)

// TestInitCommand_GivenNoExistingConfig_ThenCreatesConfig tests that init creates config file.
func TestInitCommand_GivenNoExistingConfig_ThenCreatesConfig(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Simulate user input: token, agent selection (1=claude), API key
	input := "test-sprites-token\n1\ntest-api-key\n"

	err := runInitWithInput(configPath, input)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	// Verify config file was created
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
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
	if cfg.DefaultAgent != config.AgentClaude {
		t.Errorf("DefaultAgent = %q, want %q", cfg.DefaultAgent, config.AgentClaude)
	}
	if key, ok := cfg.AgentAPIKeys["claude"]; !ok || key != "test-api-key" {
		t.Errorf("API key for claude = %q, want %q", key, "test-api-key")
	}
}

// TestInitCommand_GivenInteractiveMode_ThenPromptsForAllValues tests prompts.
func TestInitCommand_GivenInteractiveMode_ThenPromptsForAllValues(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	var outputBuf bytes.Buffer
	input := "my-token\n2\nmy-api-key\n"

	err := runInitWithIO(configPath, strings.NewReader(input), &outputBuf)
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	output := outputBuf.String()

	// Should prompt for Sprites token
	if !strings.Contains(output, "Sprites") || !strings.Contains(output, "token") {
		t.Error("should prompt for Sprites token")
	}

	// Should prompt for agent selection
	if !strings.Contains(output, "agent") || !strings.Contains(output, "claude") {
		t.Error("should prompt for agent selection with options")
	}

	// Should prompt for API key
	if !strings.Contains(output, "API") || !strings.Contains(output, "key") {
		t.Error("should prompt for API key")
	}
}

// TestInitCommand_GivenValidInput_ThenCreatesFileWithSecurePermissions tests file permissions.
func TestInitCommand_GivenValidInput_ThenCreatesFileWithSecurePermissions(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	input := "test-token\n1\ntest-key\n"

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

// TestInitCommand_GivenAgentSelection_ThenSetsCorrectAgent tests agent selection.
func TestInitCommand_GivenAgentSelection_ThenSetsCorrectAgent(t *testing.T) {
	tests := []struct {
		name     string
		choice   string
		expected config.AgentType
	}{
		{"claude", "1\n", config.AgentClaude},
		{"opencode", "2\n", config.AgentOpencode},
		{"codex", "3\n", config.AgentCodex},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tmpDir := t.TempDir()
			configPath := filepath.Join(tmpDir, "config")

			input := "token\n" + tt.choice + "api-key\n"

			err := runInitWithInput(configPath, input)
			if err != nil {
				t.Fatalf("init command error = %v", err)
			}

			cfg, err := loadConfigIgnorePerms(configPath)
			if err != nil {
				t.Fatalf("failed to load config: %v", err)
			}

			if cfg.DefaultAgent != tt.expected {
				t.Errorf("DefaultAgent = %q, want %q", cfg.DefaultAgent, tt.expected)
			}
		})
	}
}

// TestInitCommand_GivenExistingConfig_ThenLoadsAsDefaults tests loading existing config.
func TestInitCommand_GivenExistingConfig_ThenLoadsAsDefaults(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Create existing config
	existingCfg := &config.Config{
		SpritesToken: "existing-token",
		DefaultAgent: config.AgentOpencode,
		AgentAPIKeys: map[string]string{
			"opencode": "existing-key",
		},
	}
	if err := config.Save(configPath, existingCfg); err != nil {
		t.Fatalf("failed to create existing config: %v", err)
	}

	// Run init with empty inputs (press Enter to keep defaults)
	var outputBuf bytes.Buffer
	input := "\n\n\n"

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
	if cfg.DefaultAgent != config.AgentOpencode {
		t.Errorf("DefaultAgent = %q, want %q (preserved)", cfg.DefaultAgent, config.AgentOpencode)
	}
}

// TestInitCommand_GivenEnterOnAllPrompts_ThenPreservesExistingValues tests value preservation.
func TestInitCommand_GivenEnterOnAllPrompts_ThenPreservesExistingValues(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Create existing config
	existingCfg := &config.Config{
		SpritesToken: "preserve-me",
		DefaultAgent: config.AgentCodex,
		AgentAPIKeys: map[string]string{
			"codex": "preserve-key",
		},
	}
	if err := config.Save(configPath, existingCfg); err != nil {
		t.Fatalf("failed to create existing config: %v", err)
	}

	// Press Enter on all prompts
	input := "\n\n\n"

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
	if cfg.DefaultAgent != config.AgentCodex {
		t.Errorf("DefaultAgent = %q, want %q", cfg.DefaultAgent, config.AgentCodex)
	}
	if key := cfg.AgentAPIKeys["codex"]; key != "preserve-key" {
		t.Errorf("API key = %q, want %q", key, "preserve-key")
	}
}

// TestInitCommand_GivenNewInput_ThenReplacesExistingValues tests value replacement.
func TestInitCommand_GivenNewInput_ThenReplacesExistingValues(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Create existing config
	existingCfg := &config.Config{
		SpritesToken: "old-token",
		DefaultAgent: config.AgentClaude,
		AgentAPIKeys: map[string]string{
			"claude": "old-key",
		},
	}
	if err := config.Save(configPath, existingCfg); err != nil {
		t.Fatalf("failed to create existing config: %v", err)
	}

	// Provide new values
	input := "new-token\n2\nnew-key\n"

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
	if cfg.DefaultAgent != config.AgentOpencode {
		t.Errorf("DefaultAgent = %q, want %q", cfg.DefaultAgent, config.AgentOpencode)
	}
}

// TestInitCommand_GivenSuccessfulSave_ThenShowsSuccessMessage tests success message.
func TestInitCommand_GivenSuccessfulSave_ThenShowsSuccessMessage(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	var outputBuf bytes.Buffer
	input := "token\n1\nkey\n"

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
	input := "token\n1\nkey\n"

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

// Tests for non-interactive mode (User Story 3)

// TestInitCommand_GivenSpritesTokenFlag_ThenUsesFlag tests --sprites-token flag.
func TestInitCommand_GivenSpritesTokenFlag_ThenUsesFlag(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	err := runNonInteractiveInitTest(configPath, "flag-token", "claude", "flag-key")
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	cfg, err := loadConfigIgnorePerms(configPath)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.SpritesToken != "flag-token" {
		t.Errorf("SpritesToken = %q, want %q", cfg.SpritesToken, "flag-token")
	}
}

// TestInitCommand_GivenAgentFlag_ThenUsesFlag tests --agent flag.
func TestInitCommand_GivenAgentFlag_ThenUsesFlag(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	err := runNonInteractiveInitTest(configPath, "token", "opencode", "key")
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	cfg, err := loadConfigIgnorePerms(configPath)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.DefaultAgent != config.AgentOpencode {
		t.Errorf("DefaultAgent = %q, want %q", cfg.DefaultAgent, config.AgentOpencode)
	}
}

// TestInitCommand_GivenAPIKeyFlag_ThenUsesFlag tests --api-key flag.
func TestInitCommand_GivenAPIKeyFlag_ThenUsesFlag(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	err := runNonInteractiveInitTest(configPath, "token", "codex", "codex-api-key")
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	cfg, err := loadConfigIgnorePerms(configPath)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if key, ok := cfg.AgentAPIKeys["codex"]; !ok || key != "codex-api-key" {
		t.Errorf("API key for codex = %q, want %q", key, "codex-api-key")
	}
}

// TestInitCommand_GivenAllFlags_ThenSkipsPrompts tests skipping prompts with all flags.
func TestInitCommand_GivenAllFlags_ThenSkipsPrompts(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Should succeed without any input prompts
	err := runNonInteractiveInitTest(configPath, "token", "claude", "key")
	if err != nil {
		t.Fatalf("init command error = %v", err)
	}

	// Verify config was created
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		t.Error("config file was not created")
	}
}

// TestInitCommand_GivenMissingSpritesToken_ThenReturnsError tests missing token error.
func TestInitCommand_GivenMissingSpritesToken_ThenReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	err := runNonInteractiveInitTest(configPath, "", "claude", "key")
	if err == nil {
		t.Error("expected error for missing --sprites-token")
	}
	if !strings.Contains(err.Error(), "sprites-token") {
		t.Errorf("error should mention sprites-token, got: %v", err)
	}
}

// TestInitCommand_GivenMissingAgent_ThenReturnsError tests missing agent error.
func TestInitCommand_GivenMissingAgent_ThenReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	err := runNonInteractiveInitTest(configPath, "token", "", "key")
	if err == nil {
		t.Error("expected error for missing --agent")
	}
	if !strings.Contains(err.Error(), "agent") {
		t.Errorf("error should mention agent, got: %v", err)
	}
}

// TestInitCommand_GivenMissingAPIKey_ThenReturnsError tests missing API key error.
func TestInitCommand_GivenMissingAPIKey_ThenReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	err := runNonInteractiveInitTest(configPath, "token", "claude", "")
	if err == nil {
		t.Error("expected error for missing --api-key")
	}
	if !strings.Contains(err.Error(), "api-key") {
		t.Errorf("error should mention api-key, got: %v", err)
	}
}

// TestInitCommand_GivenInvalidAgent_ThenReturnsError tests invalid agent error.
func TestInitCommand_GivenInvalidAgent_ThenReturnsError(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	err := runNonInteractiveInitTest(configPath, "token", "invalid-agent", "key")
	if err == nil {
		t.Error("expected error for invalid agent")
	}
	if !strings.Contains(err.Error(), "invalid") {
		t.Errorf("error should mention invalid agent, got: %v", err)
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
func runNonInteractiveInitTest(configPath, token, agent, apiKey string) error {
	// Save and restore global flag state
	oldToken := initSpritesToken
	oldAgent := initAgent
	oldAPIKey := initAPIKey
	defer func() {
		initSpritesToken = oldToken
		initAgent = oldAgent
		initAPIKey = oldAPIKey
	}()

	initSpritesToken = token
	initAgent = agent
	initAPIKey = apiKey

	return runNonInteractiveInit(configPath)
}

// loadConfigIgnorePerms loads config without permission checks (for testing).
func loadConfigIgnorePerms(path string) (*config.Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg config.Config
	if err := unmarshalYAML(data, &cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}
