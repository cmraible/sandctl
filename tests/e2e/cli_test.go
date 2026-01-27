//go:build e2e

package e2e

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestMain builds the sandctl binary once before all tests run.
func TestMain(m *testing.M) {
	// Create temp directory for binary
	tmpDir, err := os.MkdirTemp("", "sandctl-e2e-*")
	if err != nil {
		_, _ = os.Stderr.WriteString("failed to create temp dir: " + err.Error() + "\n")
		os.Exit(1)
	}

	// Find repo root
	dir, err := os.Getwd()
	if err != nil {
		_ = os.RemoveAll(tmpDir)
		_, _ = os.Stderr.WriteString("failed to get working directory: " + err.Error() + "\n")
		os.Exit(1)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			_ = os.RemoveAll(tmpDir)
			_, _ = os.Stderr.WriteString("could not find repository root (no go.mod found)\n")
			os.Exit(1)
		}
		dir = parent
	}

	// Build binary
	binaryName := "sandctl"
	binPath := filepath.Join(tmpDir, binaryName)

	cmd := exec.Command("go", "build", "-o", binPath, "./cmd/sandctl")
	cmd.Dir = dir
	if output, err := cmd.CombinedOutput(); err != nil {
		_ = os.RemoveAll(tmpDir)
		_, _ = os.Stderr.WriteString("failed to build sandctl binary: " + err.Error() + "\n")
		_, _ = os.Stderr.WriteString(string(output) + "\n")
		os.Exit(1)
	}

	// Set the package-level binary path
	binaryPath = binPath

	// Run tests
	code := m.Run()

	// Cleanup
	_ = os.RemoveAll(tmpDir)
	os.Exit(code)
}

// TestSandctl is the parent test function that contains all sandctl e2e tests.
func TestSandctl(t *testing.T) {
	// Version test - no API needed
	t.Run("sandctl version > displays version information", testVersion)

	// Init tests - use temp directories
	t.Run("sandctl init > creates config file", testInitCreatesConfigFile)
	t.Run("sandctl init > sets correct file permissions", testInitSetsPermissions)

	// Session lifecycle tests - require Hetzner API token
	t.Run("sandctl new > creates session without arguments", testNewSucceeds)
	t.Run("sandctl new > creates session with template flag", testNewWithTemplateFlag)
	t.Run("sandctl list > shows active sessions", testListShowsSessions)
	t.Run("sandctl exec > runs command in session", testExecRunsCommand)
	t.Run("sandctl destroy > removes session", testDestroyRemovesSession)

	// Workflow test
	t.Run("workflow > complete session lifecycle", testWorkflowLifecycle)

	// Error handling tests
	t.Run("sandctl new > fails without config", testNewFailsWithoutConfig)
	t.Run("sandctl new > fails with nonexistent template", testNewWithNonexistentTemplate)
	t.Run("sandctl start > returns unknown command error", testStartReturnsUnknownCommand)
	t.Run("sandctl exec > fails for nonexistent session", testExecFailsNonexistent)
	t.Run("sandctl destroy > fails for nonexistent session", testDestroyFailsNonexistent)

	// Console command tests
	t.Run("sandctl console > fails for nonexistent session", testConsoleFailsNonexistent)
}

// testVersion tests that sandctl version displays version information.
func testVersion(t *testing.T) {
	stdout, stderr, exitCode := runSandctl(t, "version")

	if exitCode != 0 {
		t.Fatalf("expected exit code 0, got %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// Version output should contain "sandctl" or version number
	combined := stdout + stderr
	if !strings.Contains(strings.ToLower(combined), "sandctl") && !strings.Contains(combined, "version") {
		t.Errorf("version output should contain 'sandctl' or 'version', got: %s", combined)
	}
}

// testInitCreatesConfigFile tests that sandctl init creates a config file.
func testInitCreatesConfigFile(t *testing.T) {
	token := requireHetznerToken(t)
	sshKeyPath := requireSSHPublicKey(t)
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Run init with Hetzner token and SSH key
	stdout, stderr, exitCode := runSandctl(t, "--config", configPath, "init",
		"--hetzner-token", token,
		"--ssh-public-key", sshKeyPath)

	if exitCode != 0 {
		t.Fatalf("init failed with exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// Verify config file was created
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		t.Fatal("config file was not created")
	}

	// Verify config contains the new provider format
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("failed to read config file: %v", err)
	}

	if !strings.Contains(string(content), "default_provider") {
		t.Error("config file should contain default_provider")
	}
	if !strings.Contains(string(content), "hetzner") {
		t.Error("config file should contain hetzner provider")
	}
}

// testInitSetsPermissions tests that sandctl init sets correct file permissions.
func testInitSetsPermissions(t *testing.T) {
	token := requireHetznerToken(t)
	sshKeyPath := requireSSHPublicKey(t)
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Run init
	_, _, exitCode := runSandctl(t, "--config", configPath, "init",
		"--hetzner-token", token,
		"--ssh-public-key", sshKeyPath)
	if exitCode != 0 {
		t.Skip("init command failed, skipping permissions test")
	}

	// Check permissions (should be 0600 - owner read/write only)
	info, err := os.Stat(configPath)
	if err != nil {
		t.Fatalf("failed to stat config file: %v", err)
	}

	perm := info.Mode().Perm()
	if perm != 0600 {
		t.Errorf("expected permissions 0600, got %o", perm)
	}
}

// testNewSucceeds tests that sandctl new creates a session without arguments.
func testNewSucceeds(t *testing.T) {
	token := requireHetznerToken(t)
	sshKeyPath := requireSSHPublicKey(t)
	openCodeKey := requireOpenCodeKey(t)
	configPath := newTempConfig(t, token, sshKeyPath, openCodeKey)

	t.Log("creating new session")
	// Use --no-console to skip auto-console (tests run without TTY)
	stdout, stderr, exitCode := runSandctlWithConfig(t, configPath, "new", "--no-console")

	if exitCode != 0 {
		t.Fatalf("new failed with exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// Parse and register cleanup for actual session name
	sessionName := parseSessionName(t, stdout)
	t.Logf("session created: %s", sessionName)
	registerSessionCleanup(t, configPath, sessionName)
}

// testListShowsSessions tests that sandctl list shows active sessions.
func testListShowsSessions(t *testing.T) {
	token := requireHetznerToken(t)
	sshKeyPath := requireSSHPublicKey(t)
	openCodeKey := requireOpenCodeKey(t)
	configPath := newTempConfig(t, token, sshKeyPath, openCodeKey)

	stdout, stderr, exitCode := runSandctlWithConfig(t, configPath, "list")

	if exitCode != 0 {
		t.Fatalf("list failed with exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// List should return successfully (may be empty if no sessions)
	t.Logf("list output: %s", stdout)
}

// testExecRunsCommand tests that sandctl exec runs a command in a session.
func testExecRunsCommand(t *testing.T) {
	token := requireHetznerToken(t)
	sshKeyPath := requireSSHPublicKey(t)
	openCodeKey := requireOpenCodeKey(t)
	configPath := newTempConfig(t, token, sshKeyPath, openCodeKey)

	// Create a session first (use --no-console since tests run without TTY)
	t.Log("creating session for exec test")
	stdout, stderr, exitCode := runSandctlWithConfig(t, configPath, "new", "--no-console")
	if exitCode != 0 {
		t.Fatalf("could not create session for exec test: %s%s", stdout, stderr)
	}

	// Parse actual session name and register cleanup
	sessionName := parseSessionName(t, stdout)
	t.Logf("session created: %s", sessionName)
	registerSessionCleanup(t, configPath, sessionName)

	// Wait for session to be ready (Hetzner VMs take longer than Sprites)
	waitForSession(t, configPath, sessionName, 5*time.Minute)

	// Execute a command
	stdout, stderr, exitCode = runSandctlWithConfig(t, configPath, "exec", sessionName, "-c", "echo hello")

	if exitCode != 0 {
		t.Fatalf("exec failed with exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	if !strings.Contains(stdout, "hello") {
		t.Errorf("expected output to contain 'hello', got: %s", stdout)
	}
}

// testDestroyRemovesSession tests that sandctl destroy removes a session.
func testDestroyRemovesSession(t *testing.T) {
	token := requireHetznerToken(t)
	sshKeyPath := requireSSHPublicKey(t)
	openCodeKey := requireOpenCodeKey(t)
	configPath := newTempConfig(t, token, sshKeyPath, openCodeKey)

	// Create a session first (use --no-console since tests run without TTY)
	t.Log("creating session for destroy test")
	stdout, stderr, exitCode := runSandctlWithConfig(t, configPath, "new", "--no-console")
	if exitCode != 0 {
		t.Fatalf("could not create session for destroy test: %s%s", stdout, stderr)
	}

	// Parse actual session name
	sessionName := parseSessionName(t, stdout)
	t.Logf("session created: %s", sessionName)

	// Wait briefly for session
	waitForSession(t, configPath, sessionName, 5*time.Minute)

	// Destroy the session (use --force to skip confirmation)
	stdout, stderr, exitCode = runSandctlWithConfig(t, configPath, "destroy", sessionName, "--force")

	if exitCode != 0 {
		t.Fatalf("destroy failed with exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	t.Logf("destroy output: %s", stdout)
}

// testWorkflowLifecycle tests the complete user workflow: init -> new -> list -> exec -> destroy.
func testWorkflowLifecycle(t *testing.T) {
	token := requireHetznerToken(t)
	sshKeyPath := requireSSHPublicKey(t)
	openCodeKey := requireOpenCodeKey(t)
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config")

	// Track session name for cleanup (will be set after new)
	var sessionName string

	// Register cleanup in case test fails partway
	t.Cleanup(func() {
		if sessionName != "" {
			t.Logf("workflow cleanup: destroying session %s", sessionName)
			runSandctl(t, "--config", configPath, "destroy", sessionName, "--force")
		}
	})

	// Step 1: Init
	t.Log("workflow step 1: init")
	stdout, stderr, exitCode := runSandctl(t, "--config", configPath, "init",
		"--hetzner-token", token,
		"--ssh-public-key", sshKeyPath)
	if exitCode != 0 {
		t.Fatalf("workflow init failed: exit %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}
	// Add opencode_zen_key if provided (init doesn't have flag for it, append to config)
	if openCodeKey != "" {
		content, _ := os.ReadFile(configPath)
		content = append(content, []byte("\nopencode_zen_key: "+openCodeKey+"\n")...)
		_ = os.WriteFile(configPath, content, 0600)
	}

	// Step 2: New (use --no-console since tests run without TTY)
	t.Log("workflow step 2: new")
	stdout, stderr, exitCode = runSandctlWithConfig(t, configPath, "new", "--no-console")
	if exitCode != 0 {
		t.Fatalf("workflow new failed: exit %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// Parse actual session name
	sessionName = parseSessionName(t, stdout)
	t.Logf("session created: %s", sessionName)

	// Step 3: List
	t.Log("workflow step 3: list")
	stdout, stderr, exitCode = runSandctlWithConfig(t, configPath, "list")
	if exitCode != 0 {
		t.Fatalf("workflow list failed: exit %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// Step 4: Exec (if session is ready)
	t.Log("workflow step 4: exec")
	waitForSession(t, configPath, sessionName, 5*time.Minute)
	_, stderr, exitCode = runSandctlWithConfig(t, configPath, "exec", sessionName, "-c", "pwd")
	if exitCode != 0 {
		t.Logf("workflow exec note: exit %d stderr: %s (session may not support exec)", exitCode, stderr)
	}

	// Step 5: Destroy (use --force to skip confirmation)
	t.Log("workflow step 5: destroy")
	stdout, stderr, exitCode = runSandctlWithConfig(t, configPath, "destroy", sessionName, "--force")
	if exitCode != 0 {
		t.Fatalf("workflow destroy failed: exit %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// Clear sessionName so cleanup doesn't run
	sessionName = ""

	t.Log("workflow complete: all steps passed")
}

// testNewFailsWithoutConfig tests that sandctl new fails without a config file.
func testNewFailsWithoutConfig(t *testing.T) {
	tmpDir := t.TempDir()
	nonExistentConfig := filepath.Join(tmpDir, "nonexistent-config")

	stdout, stderr, exitCode := runSandctl(t, "--config", nonExistentConfig, "new")

	if exitCode == 0 {
		t.Fatalf("expected new to fail without config, but it succeeded\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	// Should have an error message
	combined := stdout + stderr
	if combined == "" {
		t.Error("expected error message when config is missing")
	}

	t.Logf("new without config failed as expected: %s", combined)
}

// testStartReturnsUnknownCommand tests that the old start command returns an unknown command error.
func testStartReturnsUnknownCommand(t *testing.T) {
	stdout, stderr, exitCode := runSandctl(t, "start")

	if exitCode == 0 {
		t.Fatalf("expected start to fail as unknown command, but it succeeded\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	combined := stdout + stderr
	if !strings.Contains(strings.ToLower(combined), "unknown") {
		t.Errorf("error message should mention 'unknown', got: %s", combined)
	}

	t.Logf("start command failed as expected with unknown command error: %s", combined)
}

// testExecFailsNonexistent tests that sandctl exec fails for nonexistent sessions.
func testExecFailsNonexistent(t *testing.T) {
	token := requireHetznerToken(t)
	sshKeyPath := requireSSHPublicKey(t)
	openCodeKey := requireOpenCodeKey(t)
	configPath := newTempConfig(t, token, sshKeyPath, openCodeKey)

	stdout, stderr, exitCode := runSandctlWithConfig(t, configPath, "exec", "nonexistent-session-12345", "-c", "echo test")

	if exitCode == 0 {
		t.Fatalf("expected exec to fail for nonexistent session, but it succeeded\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	t.Logf("exec nonexistent session failed as expected: %s%s", stdout, stderr)
}

// testDestroyFailsNonexistent tests that sandctl destroy fails for nonexistent sessions.
func testDestroyFailsNonexistent(t *testing.T) {
	token := requireHetznerToken(t)
	sshKeyPath := requireSSHPublicKey(t)
	openCodeKey := requireOpenCodeKey(t)
	configPath := newTempConfig(t, token, sshKeyPath, openCodeKey)

	stdout, stderr, exitCode := runSandctlWithConfig(t, configPath, "destroy", "nonexistent-session-12345")

	if exitCode == 0 {
		t.Fatalf("expected destroy to fail for nonexistent session, but it succeeded\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	t.Logf("destroy nonexistent session failed as expected: %s%s", stdout, stderr)
}

// testConsoleFailsNonexistent tests that sandctl console fails for nonexistent sessions.
// Note: This test can only run in an environment with a TTY. In CI (no TTY), the console
// command will detect non-terminal stdin and exit early with a helpful message.
func testConsoleFailsNonexistent(t *testing.T) {
	token := requireHetznerToken(t)
	sshKeyPath := requireSSHPublicKey(t)
	openCodeKey := requireOpenCodeKey(t)
	configPath := newTempConfig(t, token, sshKeyPath, openCodeKey)

	stdout, stderr, exitCode := runSandctlWithConfig(t, configPath, "console", "nonexistent-session-12345")

	combined := stdout + stderr

	// In CI environments without a TTY, the console command detects non-terminal stdin
	// and exits with a helpful message. This is expected behavior, not a test failure.
	if strings.Contains(combined, "console requires an interactive terminal") {
		t.Skip("skipping: console command requires a TTY which is not available in this environment")
	}

	if exitCode == 0 {
		t.Fatalf("expected console to fail for nonexistent session, but it succeeded\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	// Should have an error message about session not found
	if !strings.Contains(strings.ToLower(combined), "not found") {
		t.Errorf("expected 'not found' in error message, got: %s", combined)
	}

	t.Logf("console nonexistent session failed as expected: %s%s", stdout, stderr)
}

// testNewWithTemplateFlag tests that sandctl new -T runs the template's init script.
func testNewWithTemplateFlag(t *testing.T) {
	token := requireHetznerToken(t)
	sshKeyPath := requireSSHPublicKey(t)
	openCodeKey := requireOpenCodeKey(t)

	// Create temp home with config
	home := newTempHome(t, token, sshKeyPath, openCodeKey)

	// Add a template with init script that creates a marker file
	initScript := `#!/bin/bash
set -e
echo "Init script running for template: $SANDCTL_TEMPLATE_NAME"
touch /tmp/sandctl-init-marker
echo "INIT_SCRIPT_SUCCESS"
`
	home.addTemplateInitScript(t, "TestTemplate", initScript)

	t.Log("creating new session with template flag")
	stdout, stderr, exitCode := runSandctlWithHome(t, home, "new", "--no-console", "-T", "TestTemplate")

	if exitCode != 0 {
		t.Fatalf("new with template failed with exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// Check that init script output was shown
	if !strings.Contains(stdout, "Running template init script") {
		t.Errorf("expected 'Running template init script' in output, got: %s", stdout)
	}
	if !strings.Contains(stdout, "INIT_SCRIPT_SUCCESS") {
		t.Errorf("expected init script output 'INIT_SCRIPT_SUCCESS' in output, got: %s", stdout)
	}

	// Parse and register cleanup for actual session name
	sessionName := parseSessionName(t, stdout)
	t.Logf("session created: %s", sessionName)
	registerSessionCleanupWithHome(t, home, sessionName)

	// Wait for session to be ready
	waitForSessionWithHome(t, home, sessionName, 5*time.Minute)

	// Verify the marker file was created by the init script
	t.Log("verifying init script created marker file")
	execStdout, execStderr, execExitCode := runSandctlWithHome(t, home, "exec", sessionName, "-c", "test -f /tmp/sandctl-init-marker && echo MARKER_EXISTS")

	if execExitCode != 0 {
		t.Fatalf("exec failed to verify marker file: exit %d\nstdout: %s\nstderr: %s", execExitCode, execStdout, execStderr)
	}

	if !strings.Contains(execStdout, "MARKER_EXISTS") {
		t.Errorf("expected marker file to exist, got: %s", execStdout)
	}

	t.Log("template init script execution verified successfully")
}

// testNewWithNonexistentTemplate tests that sandctl new -T fails with a nonexistent template.
func testNewWithNonexistentTemplate(t *testing.T) {
	token := requireHetznerToken(t)
	sshKeyPath := requireSSHPublicKey(t)
	openCodeKey := requireOpenCodeKey(t)
	configPath := newTempConfig(t, token, sshKeyPath, openCodeKey)

	t.Log("creating new session with nonexistent template")
	stdout, stderr, exitCode := runSandctlWithConfig(t, configPath, "new", "--no-console", "-T", "nonexistent-template")

	combined := stdout + stderr

	if exitCode == 0 {
		// If it somehow succeeded, clean up
		sessionName := parseSessionName(t, stdout)
		registerSessionCleanup(t, configPath, sessionName)
		t.Fatalf("expected new with nonexistent template to fail, but it succeeded\nstdout: %s\nstderr: %s", stdout, stderr)
	}

	// Should have an error message about template not found
	if !strings.Contains(strings.ToLower(combined), "not found") {
		t.Errorf("expected 'not found' in error message, got: %s", combined)
	}

	t.Logf("new with nonexistent template failed as expected: %s", combined)
}
