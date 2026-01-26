//go:build e2e

package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestRepoCommands is the parent test function for repo subcommand tests.
// These tests don't require API tokens - they test local filesystem operations.
func TestRepoCommands(t *testing.T) {
	t.Run("sandctl repo > shows help", testRepoHelp)
	t.Run("sandctl repo add > creates configuration", testRepoAddCreatesConfig)
	t.Run("sandctl repo add > fails for existing config", testRepoAddFailsForExisting)
	t.Run("sandctl repo add > fails without repo flag in non-interactive", testRepoAddFailsWithoutFlag)
	t.Run("sandctl repo list > shows configured repos", testRepoListShowsRepos)
	t.Run("sandctl repo list > shows empty message", testRepoListEmpty)
	t.Run("sandctl repo list --json > outputs JSON", testRepoListJSON)
	t.Run("sandctl repo show > displays init script", testRepoShowDisplaysScript)
	t.Run("sandctl repo show > fails for missing config", testRepoShowFailsMissing)
	t.Run("sandctl repo remove > removes configuration", testRepoRemoveRemovesConfig)
	t.Run("sandctl repo remove > fails for missing config", testRepoRemoveFailsMissing)
}

// newTempReposDir creates a temporary repos directory and returns a cleanup function.
func newTempReposDir(t *testing.T) string {
	t.Helper()

	tmpDir := t.TempDir()
	reposDir := filepath.Join(tmpDir, ".sandctl", "repos")
	if err := os.MkdirAll(reposDir, 0700); err != nil {
		t.Fatalf("failed to create repos dir: %v", err)
	}

	// Set HOME to temp dir so sandctl uses our temp repos directory
	t.Setenv("HOME", tmpDir)

	return tmpDir
}

func testRepoHelp(t *testing.T) {
	stdout, stderr, exitCode := runSandctl(t, "repo", "--help")

	if exitCode != 0 {
		t.Fatalf("expected exit code 0, got %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	combined := stdout + stderr
	if !strings.Contains(combined, "repo") {
		t.Errorf("help output should mention 'repo', got: %s", combined)
	}
}

func testRepoAddCreatesConfig(t *testing.T) {
	newTempReposDir(t)

	stdout, stderr, exitCode := runSandctl(t, "repo", "add", "-R", "octocat/Hello-World")

	if exitCode != 0 {
		t.Fatalf("repo add failed with exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// Check success message
	if !strings.Contains(stdout, "Created init script") {
		t.Errorf("expected 'Created init script' in output, got: %s", stdout)
	}

	if !strings.Contains(stdout, "octocat/Hello-World") {
		t.Errorf("expected repo name in output, got: %s", stdout)
	}
}

func testRepoAddFailsForExisting(t *testing.T) {
	newTempReposDir(t)

	// Create first config
	_, _, exitCode := runSandctl(t, "repo", "add", "-R", "octocat/Hello-World")
	if exitCode != 0 {
		t.Fatal("first repo add should succeed")
	}

	// Try to create again
	stdout, stderr, exitCode := runSandctl(t, "repo", "add", "-R", "octocat/Hello-World")

	// Exit code should still be 0 (we print error but don't fail)
	combined := stdout + stderr
	if !strings.Contains(strings.ToLower(combined), "already configured") {
		t.Errorf("expected 'already configured' in output, got: %s", combined)
	}
}

func testRepoAddFailsWithoutFlag(t *testing.T) {
	newTempReposDir(t)

	stdout, stderr, exitCode := runSandctl(t, "repo", "add")

	if exitCode == 0 {
		t.Fatalf("expected repo add without flag to fail, got success\nstdout: %s", stdout)
	}

	combined := stdout + stderr
	if !strings.Contains(strings.ToLower(combined), "required") {
		t.Errorf("expected 'required' in error message, got: %s", combined)
	}
}

func testRepoListShowsRepos(t *testing.T) {
	newTempReposDir(t)

	// Create a config first
	_, _, _ = runSandctl(t, "repo", "add", "-R", "octocat/Hello-World")

	stdout, stderr, exitCode := runSandctl(t, "repo", "list")

	if exitCode != 0 {
		t.Fatalf("repo list failed with exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	if !strings.Contains(stdout, "octocat/Hello-World") {
		t.Errorf("expected repo name in list output, got: %s", stdout)
	}

	if !strings.Contains(stdout, "REPOSITORY") {
		t.Errorf("expected header in list output, got: %s", stdout)
	}
}

func testRepoListEmpty(t *testing.T) {
	newTempReposDir(t)

	stdout, stderr, exitCode := runSandctl(t, "repo", "list")

	if exitCode != 0 {
		t.Fatalf("repo list failed with exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	if !strings.Contains(stdout, "No repository configurations") {
		t.Errorf("expected empty message, got: %s", stdout)
	}
}

func testRepoListJSON(t *testing.T) {
	newTempReposDir(t)

	// Create a config first
	_, _, _ = runSandctl(t, "repo", "add", "-R", "octocat/Hello-World")

	stdout, stderr, exitCode := runSandctl(t, "repo", "list", "--json")

	if exitCode != 0 {
		t.Fatalf("repo list --json failed with exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// Check for JSON structure
	if !strings.Contains(stdout, `"original_name"`) {
		t.Errorf("expected JSON structure in output, got: %s", stdout)
	}

	if !strings.Contains(stdout, `"octocat/Hello-World"`) {
		t.Errorf("expected repo name in JSON output, got: %s", stdout)
	}
}

func testRepoShowDisplaysScript(t *testing.T) {
	newTempReposDir(t)

	// Create a config first
	_, _, _ = runSandctl(t, "repo", "add", "-R", "octocat/Hello-World")

	stdout, stderr, exitCode := runSandctl(t, "repo", "show", "octocat/Hello-World")

	if exitCode != 0 {
		t.Fatalf("repo show failed with exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	// Should show script content with shebang
	if !strings.Contains(stdout, "#!/bin/bash") {
		t.Errorf("expected shebang in output, got: %s", stdout)
	}

	// Should show header with repo name
	if !strings.Contains(stdout, "octocat/Hello-World") {
		t.Errorf("expected repo name in header, got: %s", stdout)
	}
}

func testRepoShowFailsMissing(t *testing.T) {
	newTempReposDir(t)

	stdout, stderr, exitCode := runSandctl(t, "repo", "show", "nonexistent/repo")

	// We print error message but exit 0
	combined := stdout + stderr
	if !strings.Contains(strings.ToLower(combined), "no configuration found") {
		t.Errorf("expected 'no configuration found' in output, got: %s", combined)
	}
	_ = exitCode // Exit code may be 0 since we handle error gracefully
}

func testRepoRemoveRemovesConfig(t *testing.T) {
	newTempReposDir(t)

	// Create a config first
	_, _, _ = runSandctl(t, "repo", "add", "-R", "octocat/Hello-World")

	// Remove with --force
	stdout, stderr, exitCode := runSandctl(t, "repo", "remove", "octocat/Hello-World", "--force")

	if exitCode != 0 {
		t.Fatalf("repo remove failed with exit code %d\nstdout: %s\nstderr: %s", exitCode, stdout, stderr)
	}

	if !strings.Contains(stdout, "Removed configuration") {
		t.Errorf("expected success message, got: %s", stdout)
	}

	// Verify it's gone
	listStdout, _, _ := runSandctl(t, "repo", "list")
	if strings.Contains(listStdout, "octocat/Hello-World") {
		t.Error("repo should be removed from list")
	}
}

func testRepoRemoveFailsMissing(t *testing.T) {
	newTempReposDir(t)

	stdout, stderr, exitCode := runSandctl(t, "repo", "remove", "nonexistent/repo", "--force")

	// We print error message but exit 0
	combined := stdout + stderr
	if !strings.Contains(strings.ToLower(combined), "no configuration found") {
		t.Errorf("expected 'no configuration found' in output, got: %s", combined)
	}
	_ = exitCode // Exit code may be 0 since we handle error gracefully
}
