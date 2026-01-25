//go:build e2e

// Package e2e contains end-to-end tests that invoke the sandctl CLI binary.
// These tests require a valid SPRITES_API_TOKEN environment variable.
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

// requireToken returns the SPRITES_API_TOKEN from environment or fails the test.
func requireToken(t *testing.T) string {
	t.Helper()

	token := os.Getenv("SPRITES_API_TOKEN")
	if token == "" {
		t.Fatal("SPRITES_API_TOKEN not set - E2E tests require an API token")
	}
	return token
}

// requireOpenCodeKey returns the OPENCODE_ZEN_KEY from environment or fails the test.
func requireOpenCodeKey(t *testing.T) string {
	t.Helper()

	key := os.Getenv("OPENCODE_ZEN_KEY")
	if key == "" {
		t.Fatal("OPENCODE_ZEN_KEY not set - E2E tests require an OpenCode key")
	}
	return key
}

// configData represents the sandctl config file structure.
type configData struct {
	SpritesToken   string `yaml:"sprites_token"`
	OpenCodeZenKey string `yaml:"opencode_zen_key,omitempty"`
}

// newTempConfig creates a sandctl config file in a temp directory with the given credentials.
// Returns the path to the config file.
func newTempConfig(t *testing.T, token, openCodeKey string) string {
	t.Helper()

	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	cfg := configData{
		SpritesToken:   token,
		OpenCodeZenKey: openCodeKey,
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
	pollInterval := 2 * time.Second

	for time.Now().Before(deadline) {
		stdout, _, exitCode := runSandctlWithConfig(t, configPath, "list", "--format", "json")
		if exitCode == 0 && strings.Contains(stdout, sessionName) {
			t.Logf("session %s is ready", sessionName)
			return
		}
		time.Sleep(pollInterval)
	}

	t.Fatalf("timeout waiting for session %s to be ready", sessionName)
}
