//go:build e2e

// Package e2e contains end-to-end tests that invoke the sandctl CLI binary.
// These tests require a valid HETZNER_API_TOKEN environment variable.
// Run with: go test -v -tags=e2e ./tests/e2e/...
package e2e

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"
)

// binaryPath holds the path to the compiled sandctl binary.
// Set by TestMain before tests run.
var binaryPath string

// runSandctl executes the sandctl binary with the given arguments.
// Returns stdout, stderr, and exit code.
func runSandctl(t *testing.T, args ...string) (stdout, stderr string, exitCode int) {
	t.Helper()

	cmd := exec.Command(binaryPath, args...)
	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	err := cmd.Run()
	stdout = stdoutBuf.String()
	stderr = stderrBuf.String()

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			t.Fatalf("failed to run sandctl: %v", err)
		}
	}

	return stdout, stderr, exitCode
}

// runSandctlWithConfig executes sandctl with the --config flag pointing to a custom config file.
func runSandctlWithConfig(t *testing.T, configPath string, args ...string) (stdout, stderr string, exitCode int) {
	t.Helper()

	fullArgs := append([]string{"--config", configPath}, args...)
	return runSandctl(t, fullArgs...)
}

// runSandctlWithHome executes sandctl with a custom HOME directory (for repo init scripts).
func runSandctlWithHome(t *testing.T, home *tempHome, args ...string) (stdout, stderr string, exitCode int) {
	t.Helper()

	fullArgs := append([]string{"--config", home.ConfigPath}, args...)

	cmd := exec.Command(binaryPath, fullArgs...)
	cmd.Env = append(os.Environ(), "HOME="+home.HomeDir)
	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	err := cmd.Run()
	stdout = stdoutBuf.String()
	stderr = stderrBuf.String()

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			t.Fatalf("failed to run sandctl: %v", err)
		}
	}

	return stdout, stderr, exitCode
}

// requireHetznerToken returns the HETZNER_API_TOKEN from environment or fails the test.
func requireHetznerToken(t *testing.T) string {
	t.Helper()

	token := os.Getenv("HETZNER_API_TOKEN")
	if token == "" {
		t.Fatal("HETZNER_API_TOKEN not set - E2E tests require a Hetzner API token")
	}
	return token
}

// generateTempSSHKey generates a temporary SSH key pair for testing.
// Returns the path to the public key file. The private key is at the same path without .pub.
// The key is generated without a passphrase for automated testing.
func generateTempSSHKey(t *testing.T) string {
	t.Helper()

	tmpDir := t.TempDir()
	keyPath := filepath.Join(tmpDir, "id_ed25519")

	// Generate SSH key using ssh-keygen (no passphrase)
	cmd := exec.Command("ssh-keygen", "-t", "ed25519", "-f", keyPath, "-N", "", "-q")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("failed to generate SSH key: %v\noutput: %s", err, output)
	}

	pubKeyPath := keyPath + ".pub"

	// Verify both keys exist
	if _, err := os.Stat(keyPath); err != nil {
		t.Fatalf("private key not found at %s: %v", keyPath, err)
	}
	if _, err := os.Stat(pubKeyPath); err != nil {
		t.Fatalf("public key not found at %s: %v", pubKeyPath, err)
	}

	t.Logf("generated temporary SSH key: %s", keyPath)
	return pubKeyPath
}

// requireSSHPublicKey returns the SSH_PUBLIC_KEY path from environment or generates a temp key.
func requireSSHPublicKey(t *testing.T) string {
	t.Helper()

	keyPath := os.Getenv("SSH_PUBLIC_KEY")
	if keyPath == "" {
		// Generate a temporary SSH key for testing
		return generateTempSSHKey(t)
	}

	// Expand ~ if present
	if strings.HasPrefix(keyPath, "~/") {
		home, _ := os.UserHomeDir()
		keyPath = filepath.Join(home, keyPath[2:])
	}

	// Verify key exists
	if _, err := os.Stat(keyPath); err != nil {
		t.Fatalf("SSH public key not found at %s: %v", keyPath, err)
	}

	return keyPath
}

// requireOpenCodeKey returns the OPENCODE_ZEN_KEY from environment or returns empty (optional).
func requireOpenCodeKey(t *testing.T) string {
	t.Helper()
	return os.Getenv("OPENCODE_ZEN_KEY")
}

// providerConfig represents the provider-specific config.
type providerConfig struct {
	Token      string `yaml:"token"`
	Region     string `yaml:"region,omitempty"`
	ServerType string `yaml:"server_type,omitempty"`
	Image      string `yaml:"image,omitempty"`
}

// configData represents the sandctl config file structure.
type configData struct {
	DefaultProvider string                    `yaml:"default_provider"`
	SSHPublicKey    string                    `yaml:"ssh_public_key"`
	OpenCodeZenKey  string                    `yaml:"opencode_zen_key,omitempty"`
	Providers       map[string]providerConfig `yaml:"providers"`
}

// tempHome represents a temporary home directory for sandctl tests.
type tempHome struct {
	HomeDir    string // The temp home directory (set as HOME env var)
	ConfigPath string // Path to the sandctl config file
}

// newTempHome creates a temp directory structure that acts as HOME for sandctl.
// This allows tests to configure repo init scripts and other user-specific settings.
func newTempHome(t *testing.T, hetznerToken, sshKeyPath, openCodeKey string) *tempHome {
	t.Helper()

	tmpDir := t.TempDir()
	sandctlDir := filepath.Join(tmpDir, ".sandctl")
	if err := os.MkdirAll(sandctlDir, 0700); err != nil {
		t.Fatalf("failed to create .sandctl dir: %v", err)
	}

	configPath := filepath.Join(sandctlDir, "config")

	cfg := configData{
		DefaultProvider: "hetzner",
		SSHPublicKey:    sshKeyPath,
		OpenCodeZenKey:  openCodeKey,
		Providers: map[string]providerConfig{
			"hetzner": {
				Token:      hetznerToken,
				Region:     "ash",
				ServerType: "cpx31",
				Image:      "ubuntu-24.04",
			},
		},
	}

	data, err := yaml.Marshal(&cfg)
	if err != nil {
		t.Fatalf("failed to marshal config: %v", err)
	}

	if err := os.WriteFile(configPath, data, 0600); err != nil {
		t.Fatalf("failed to write config file: %v", err)
	}

	return &tempHome{
		HomeDir:    tmpDir,
		ConfigPath: configPath,
	}
}

// addTemplateInitScript adds an init script for a template in the temp home.
// The name will be normalized (lowercase, hyphens).
func (h *tempHome) addTemplateInitScript(t *testing.T, name, scriptContent string) {
	t.Helper()

	// Normalize template name: lowercase
	normalizedName := strings.ToLower(name)

	templateDir := filepath.Join(h.HomeDir, ".sandctl", "templates", normalizedName)
	if err := os.MkdirAll(templateDir, 0700); err != nil {
		t.Fatalf("failed to create template dir: %v", err)
	}

	// Write config.yaml (required for the template to be recognized)
	configContent := "template: " + normalizedName + "\noriginal_name: " + name + "\ncreated_at: 2026-01-25T00:00:00Z\n"
	configPath := filepath.Join(templateDir, "config.yaml")
	if err := os.WriteFile(configPath, []byte(configContent), 0600); err != nil {
		t.Fatalf("failed to write template config: %v", err)
	}

	// Write init.sh
	scriptPath := filepath.Join(templateDir, "init.sh")
	if err := os.WriteFile(scriptPath, []byte(scriptContent), 0700); err != nil {
		t.Fatalf("failed to write init script: %v", err)
	}

	t.Logf("created init script for template %s at %s", name, scriptPath)
}

// newTempConfig creates a sandctl config file in a temp directory with the given credentials.
// Returns the path to the config file.
// Deprecated: Use newTempHome for tests that need repo init scripts.
func newTempConfig(t *testing.T, hetznerToken, sshKeyPath, openCodeKey string) string {
	t.Helper()

	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	cfg := configData{
		DefaultProvider: "hetzner",
		SSHPublicKey:    sshKeyPath,
		OpenCodeZenKey:  openCodeKey,
		Providers: map[string]providerConfig{
			"hetzner": {
				Token:      hetznerToken,
				Region:     "ash",
				ServerType: "cpx31",
				Image:      "ubuntu-24.04",
			},
		},
	}

	data, err := yaml.Marshal(&cfg)
	if err != nil {
		t.Fatalf("failed to marshal config: %v", err)
	}

	if err := os.WriteFile(configPath, data, 0600); err != nil {
		t.Fatalf("failed to write config file: %v", err)
	}

	return configPath
}

// registerSessionCleanup registers a cleanup function to destroy the session when the test completes.
func registerSessionCleanup(t *testing.T, configPath, sessionName string) {
	t.Helper()

	t.Cleanup(func() {
		t.Logf("cleaning up session: %s", sessionName)
		stdout, stderr, exitCode := runSandctlWithConfig(t, configPath, "destroy", sessionName, "--force")
		if exitCode != 0 {
			// Don't fail on cleanup errors - the session might already be deleted
			t.Logf("warning: cleanup of session %s failed (exit %d): %s%s", sessionName, exitCode, stdout, stderr)
		}
	})
}

// registerSessionCleanupWithHome registers a cleanup function using a tempHome.
func registerSessionCleanupWithHome(t *testing.T, home *tempHome, sessionName string) {
	t.Helper()

	t.Cleanup(func() {
		t.Logf("cleaning up session: %s", sessionName)
		stdout, stderr, exitCode := runSandctlWithHome(t, home, "destroy", sessionName, "--force")
		if exitCode != 0 {
			t.Logf("warning: cleanup of session %s failed (exit %d): %s%s", sessionName, exitCode, stdout, stderr)
		}
	})
}

// parseSessionName extracts the session name from sandctl new output.
// Looks for "Session created: <name>" pattern.
func parseSessionName(t *testing.T, output string) string {
	t.Helper()

	for _, line := range strings.Split(output, "\n") {
		if strings.HasPrefix(line, "Session created:") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}

	t.Fatalf("could not parse session name from output: %s", output)
	return ""
}

// waitForSession waits for a session to be ready with polling.
func waitForSession(t *testing.T, configPath, sessionName string, timeout time.Duration) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	pollInterval := 5 * time.Second

	for time.Now().Before(deadline) {
		stdout, _, exitCode := runSandctlWithConfig(t, configPath, "list")
		if exitCode == 0 && strings.Contains(stdout, sessionName) && strings.Contains(stdout, "running") {
			t.Logf("session %s is ready", sessionName)
			return
		}
		t.Logf("waiting for session %s to be ready...", sessionName)
		time.Sleep(pollInterval)
	}

	t.Fatalf("timeout waiting for session %s to be ready", sessionName)
}

// waitForSessionWithHome waits for a session to be ready using a tempHome.
func waitForSessionWithHome(t *testing.T, home *tempHome, sessionName string, timeout time.Duration) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	pollInterval := 5 * time.Second

	for time.Now().Before(deadline) {
		stdout, _, exitCode := runSandctlWithHome(t, home, "list")
		if exitCode == 0 && strings.Contains(stdout, sessionName) && strings.Contains(stdout, "running") {
			t.Logf("session %s is ready", sessionName)
			return
		}
		t.Logf("waiting for session %s to be ready...", sessionName)
		time.Sleep(pollInterval)
	}

	t.Fatalf("timeout waiting for session %s to be ready", sessionName)
}
