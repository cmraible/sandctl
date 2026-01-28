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

// TestValidateEmail tests email validation logic.
func TestValidateEmail(t *testing.T) {
	tests := []struct {
		name    string
		email   string
		wantErr bool
	}{
		{"valid simple", "user@example.com", false},
		{"valid with subdomain", "user@mail.example.com", false},
		{"valid with plus", "user+test@example.com", false},
		{"empty", "", true},
		{"whitespace only", "   ", true},
		{"no @", "userexample.com", true},
		{"multiple @", "user@@example.com", true},
		{"no username", "@example.com", true},
		{"no domain", "user@", true},
		{"domain without dot", "user@domain", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateEmail(tt.email)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateEmail(%q) error = %v, wantErr %v", tt.email, err, tt.wantErr)
			}
		})
	}
}

// TestGenerateGitConfig tests Git config generation.
func TestGenerateGitConfig(t *testing.T) {
	identity := GitIdentity{
		Name:  "John Doe",
		Email: "john@example.com",
	}

	result := generateGitConfig(identity)
	resultStr := string(result)

	// Check that the config contains the expected sections
	if !strings.Contains(resultStr, "[user]") {
		t.Error("generated config should contain [user] section")
	}
	if !strings.Contains(resultStr, "name = John Doe") {
		t.Error("generated config should contain name")
	}
	if !strings.Contains(resultStr, "email = john@example.com") {
		t.Error("generated config should contain email")
	}
}

// TestReadGitConfig tests reading a Git config file.
func TestReadGitConfig(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, ".gitconfig")

	content := "[user]\n\tname = Test User\n\temail = test@example.com\n"
	if err := os.WriteFile(configPath, []byte(content), 0600); err != nil {
		t.Fatalf("failed to create test .gitconfig: %v", err)
	}

	result, err := readGitConfig(configPath)
	if err != nil {
		t.Errorf("readGitConfig() error = %v, want nil", err)
	}

	if string(result) != content {
		t.Errorf("readGitConfig() content = %q, want %q", string(result), content)
	}
}

// TestReadGitConfig_NotFound tests reading a non-existent file.
func TestReadGitConfig_NotFound(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "nonexistent.gitconfig")

	_, err := readGitConfig(configPath)
	if err == nil {
		t.Error("readGitConfig() should return error for non-existent file")
	}
	if !os.IsNotExist(err) {
		t.Errorf("readGitConfig() error should be IsNotExist, got: %v", err)
	}
}

// TestReadGitConfig_Directory tests reading a directory instead of file.
func TestReadGitConfig_Directory(t *testing.T) {
	tmpDir := t.TempDir()

	_, err := readGitConfig(tmpDir)
	if err == nil {
		t.Error("readGitConfig() should return error for directory")
	}
	if !strings.Contains(err.Error(), "directory") {
		t.Errorf("error should mention directory, got: %v", err)
	}
}

// TestReadDefaultGitConfig tests reading the default ~/.gitconfig.
func TestReadDefaultGitConfig(t *testing.T) {
	// This test checks if the function works, but may skip if no .gitconfig exists
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("could not get home directory")
	}

	gitconfigPath := filepath.Join(home, ".gitconfig")
	_, statErr := os.Stat(gitconfigPath)

	content, err := readDefaultGitConfig()

	if statErr == nil {
		// .gitconfig exists, should read successfully
		if err != nil {
			t.Errorf("readDefaultGitConfig() error = %v, want nil (file exists)", err)
		}
		if len(content) == 0 {
			t.Error("readDefaultGitConfig() returned empty content")
		}
	} else if os.IsNotExist(statErr) {
		// .gitconfig doesn't exist, should return error
		if err == nil {
			t.Error("readDefaultGitConfig() should return error when ~/.gitconfig doesn't exist")
		}
	}
}

// TestGitMethodConversion tests conversion between GitConfigMethod and string.
func TestGitMethodConversion(t *testing.T) {
	tests := []struct {
		method GitConfigMethod
		str    string
	}{
		{MethodDefault, "default"},
		{MethodCustom, "custom"},
		{MethodCreateNew, "create_new"},
		{MethodSkip, "skip"},
	}

	for _, tt := range tests {
		t.Run(tt.str, func(t *testing.T) {
			// Test method to string
			result := gitMethodToString(tt.method)
			if result != tt.str {
				t.Errorf("gitMethodToString(%v) = %q, want %q", tt.method, result, tt.str)
			}

			// Test string to method
			method := stringToGitMethod(tt.str)
			if method != tt.method {
				t.Errorf("stringToGitMethod(%q) = %v, want %v", tt.str, method, tt.method)
			}
		})
	}

	// Test unknown string defaults to skip
	result := stringToGitMethod("unknown")
	if result != MethodSkip {
		t.Errorf("stringToGitMethod('unknown') = %v, want MethodSkip", result)
	}
}

// TestGitConfigEncoding tests encoding and decoding Git config content.
func TestGitConfigEncoding(t *testing.T) {
	original := []byte("[user]\n\tname = Test User\n\temail = test@example.com\n")

	// Encode
	encoded := encodeGitConfig(original)
	if encoded == "" {
		t.Error("encodeGitConfig() returned empty string")
	}

	// Decode
	decoded, err := decodeGitConfig(encoded)
	if err != nil {
		t.Errorf("decodeGitConfig() error = %v, want nil", err)
	}

	if string(decoded) != string(original) {
		t.Errorf("decoded content = %q, want %q", string(decoded), string(original))
	}
}

// TestGitConfigEncoding_InvalidBase64 tests decoding invalid base64.
func TestGitConfigEncoding_InvalidBase64(t *testing.T) {
	_, err := decodeGitConfig("invalid!@#$%")
	if err == nil {
		t.Error("decodeGitConfig() should return error for invalid base64")
	}
}
