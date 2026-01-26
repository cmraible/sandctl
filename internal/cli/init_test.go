package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// TestExpandPath_GivenTildePath_ThenExpandsHome tests tilde expansion.
func TestExpandPath_GivenTildePath_ThenExpandsHome(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("could not get home directory")
	}

	result := expandPath("~/.ssh/id_ed25519.pub")

	expected := filepath.Join(home, ".ssh/id_ed25519.pub")
	if result != expected {
		t.Errorf("expandPath(~/.ssh/id_ed25519.pub) = %q, want %q", result, expected)
	}
}

// TestExpandPath_GivenAbsolutePath_ThenReturnsUnchanged tests absolute path handling.
func TestExpandPath_GivenAbsolutePath_ThenReturnsUnchanged(t *testing.T) {
	result := expandPath("/etc/ssh/key.pub")

	if result != "/etc/ssh/key.pub" {
		t.Errorf("expandPath(/etc/ssh/key.pub) = %q, want unchanged", result)
	}
}

// TestExpandPath_GivenRelativePath_ThenReturnsUnchanged tests relative path handling.
func TestExpandPath_GivenRelativePath_ThenReturnsUnchanged(t *testing.T) {
	result := expandPath("relative/path.pub")

	if result != "relative/path.pub" {
		t.Errorf("expandPath(relative/path.pub) = %q, want unchanged", result)
	}
}

// TestRunNonInteractiveInit_GivenMissingToken_ThenReturnsError tests missing token.
func TestRunNonInteractiveInit_GivenMissingToken_ThenReturnsError(t *testing.T) {
	// Save and restore global flag state
	oldToken := initHetznerToken
	oldKey := initSSHPublicKey
	defer func() {
		initHetznerToken = oldToken
		initSSHPublicKey = oldKey
	}()

	initHetznerToken = ""
	initSSHPublicKey = "~/.ssh/id_ed25519.pub"

	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	err := runNonInteractiveInit(configPath)
	if err == nil {
		t.Error("expected error for missing --hetzner-token")
	}
	if !strings.Contains(err.Error(), "hetzner-token") {
		t.Errorf("error should mention hetzner-token, got: %v", err)
	}
}

// TestRunNonInteractiveInit_GivenMissingSSHKey_ThenReturnsError tests missing SSH key.
func TestRunNonInteractiveInit_GivenMissingSSHKey_ThenReturnsError(t *testing.T) {
	// Save and restore global flag state
	oldToken := initHetznerToken
	oldKey := initSSHPublicKey
	defer func() {
		initHetznerToken = oldToken
		initSSHPublicKey = oldKey
	}()

	initHetznerToken = "test-token"
	initSSHPublicKey = ""

	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	err := runNonInteractiveInit(configPath)
	if err == nil {
		t.Error("expected error for missing --ssh-public-key")
	}
	if !strings.Contains(err.Error(), "ssh-public-key") {
		t.Errorf("error should mention ssh-public-key, got: %v", err)
	}
}

// TestRunNonInteractiveInit_GivenValidFlags_ThenCreatesConfig tests successful creation.
func TestRunNonInteractiveInit_GivenValidFlags_ThenCreatesConfig(t *testing.T) {
	// Create a temp SSH key file
	tmpDir := t.TempDir()
	sshKeyPath := filepath.Join(tmpDir, "id_ed25519.pub")
	if err := os.WriteFile(sshKeyPath, []byte("ssh-ed25519 AAAA... test@example.com"), 0644); err != nil {
		t.Fatalf("failed to create SSH key file: %v", err)
	}

	// Save and restore global flag state
	oldToken := initHetznerToken
	oldKey := initSSHPublicKey
	oldRegion := initRegion
	oldServerType := initServerType
	defer func() {
		initHetznerToken = oldToken
		initSSHPublicKey = oldKey
		initRegion = oldRegion
		initServerType = oldServerType
	}()

	initHetznerToken = "test-token"
	initSSHPublicKey = sshKeyPath
	initRegion = ""     // Use default
	initServerType = "" // Use default

	configPath := filepath.Join(tmpDir, "config")

	err := runNonInteractiveInit(configPath)
	if err != nil {
		t.Fatalf("runNonInteractiveInit error: %v", err)
	}

	// Verify config was created
	if _, statErr := os.Stat(configPath); os.IsNotExist(statErr) {
		t.Error("config file was not created")
	}

	// Verify config content
	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("failed to read config: %v", err)
	}

	var cfg map[string]interface{}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		t.Fatalf("failed to parse config: %v", err)
	}

	if cfg["default_provider"] != "hetzner" {
		t.Errorf("default_provider = %v, want hetzner", cfg["default_provider"])
	}
	if cfg["ssh_public_key"] != sshKeyPath {
		t.Errorf("ssh_public_key = %v, want %s", cfg["ssh_public_key"], sshKeyPath)
	}

	providers, ok := cfg["providers"].(map[string]interface{})
	if !ok {
		t.Fatal("providers not found or invalid type")
	}

	hetzner, ok := providers["hetzner"].(map[string]interface{})
	if !ok {
		t.Fatal("hetzner provider not found or invalid type")
	}

	if hetzner["token"] != "test-token" {
		t.Errorf("hetzner.token = %v, want test-token", hetzner["token"])
	}
	if hetzner["region"] != "ash" {
		t.Errorf("hetzner.region = %v, want ash (default)", hetzner["region"])
	}
	if hetzner["server_type"] != "cpx31" {
		t.Errorf("hetzner.server_type = %v, want cpx31 (default)", hetzner["server_type"])
	}
}

// TestLoadExistingConfig_GivenLegacyConfig_ThenLoadsFields tests legacy config loading.
func TestLoadExistingConfig_GivenLegacyConfig_ThenLoadsFields(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	legacyContent := `sprites_token: "old-sprites-token"
opencode_zen_key: "old-zen-key"
`
	if err := os.WriteFile(configPath, []byte(legacyContent), 0600); err != nil {
		t.Fatalf("failed to create legacy config: %v", err)
	}

	cfg := loadExistingConfig(configPath)
	if cfg == nil {
		t.Fatal("loadExistingConfig returned nil")
	}

	if cfg.SpritesToken != "old-sprites-token" {
		t.Errorf("SpritesToken = %q, want old-sprites-token", cfg.SpritesToken)
	}
	if cfg.OpencodeZenKey != "old-zen-key" {
		t.Errorf("OpencodeZenKey = %q, want old-zen-key", cfg.OpencodeZenKey)
	}

	// Should be detected as legacy
	if !cfg.IsLegacyConfig() {
		t.Error("config should be detected as legacy")
	}
}

// TestLoadExistingConfig_GivenNewConfig_ThenLoadsFields tests new config loading.
func TestLoadExistingConfig_GivenNewConfig_ThenLoadsFields(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Create a valid new config with SSH key
	sshKeyPath := filepath.Join(tmpDir, "id_ed25519.pub")
	if err := os.WriteFile(sshKeyPath, []byte("ssh-ed25519 AAAA... test"), 0644); err != nil {
		t.Fatalf("failed to create SSH key: %v", err)
	}

	newContent := `default_provider: hetzner
ssh_public_key: ` + sshKeyPath + `
opencode_zen_key: "zen-key"
providers:
  hetzner:
    token: "hetzner-token"
    region: ash
    server_type: cpx31
    image: ubuntu-24.04
`
	if err := os.WriteFile(configPath, []byte(newContent), 0600); err != nil {
		t.Fatalf("failed to create new config: %v", err)
	}

	cfg := loadExistingConfig(configPath)
	if cfg == nil {
		t.Fatal("loadExistingConfig returned nil")
	}

	if cfg.DefaultProvider != "hetzner" {
		t.Errorf("DefaultProvider = %q, want hetzner", cfg.DefaultProvider)
	}
	if cfg.OpencodeZenKey != "zen-key" {
		t.Errorf("OpencodeZenKey = %q, want zen-key", cfg.OpencodeZenKey)
	}

	// Should NOT be detected as legacy
	if cfg.IsLegacyConfig() {
		t.Error("config should NOT be detected as legacy")
	}
}
