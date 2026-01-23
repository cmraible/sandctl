//go:build e2e

// Package e2e contains end-to-end tests that provision real Sprites VMs.
// These tests require a valid SPRITES_API_TOKEN environment variable.
// Run with: go test -v -tags=e2e ./tests/e2e/...
package e2e

import (
	"errors"
	"strings"
	"testing"

	"github.com/sandctl/sandctl/internal/sprites"
)

// TestSprite_Lifecycle_GivenValidToken_ThenCreatesExecsDeletes tests the full
// sprite lifecycle: create, wait for ready, execute command, delete, verify 404.
func TestSprite_Lifecycle_GivenValidToken_ThenCreatesExecsDeletes(t *testing.T) {
	client := newTestClient(t)
	name := generateTestSpriteName(t)

	// Register cleanup first (runs even if test fails)
	registerCleanup(t, client, name)

	// Step 1: Create sprite
	t.Logf("creating sprite: %s", name)
	sprite, err := client.CreateSprite(sprites.CreateSpriteRequest{
		Name: name,
	})
	if err != nil {
		t.Fatalf("failed to create sprite: %v", err)
	}
	if sprite.Name != name {
		t.Errorf("sprite name = %q, want %q", sprite.Name, name)
	}
	t.Logf("created sprite: %s (state: %s)", sprite.Name, sprite.State)

	// Step 2: Wait for sprite to be ready
	readySprite := waitForSpriteReady(t, client, name, defaultWaitTimeout)
	if readySprite == nil {
		t.Fatal("sprite never became ready")
	}

	// Step 3: Execute a command
	t.Log("executing echo command")
	output, err := client.ExecCommand(name, "echo hello")
	if err != nil {
		t.Fatalf("failed to execute command: %v", err)
	}
	output = strings.TrimSpace(output)
	if output != "hello" {
		t.Errorf("exec output = %q, want %q", output, "hello")
	}
	t.Logf("exec output: %q", output)

	// Step 4: Delete sprite
	t.Log("deleting sprite")
	if err := client.DeleteSprite(name); err != nil {
		t.Fatalf("failed to delete sprite: %v", err)
	}

	// Step 5: Verify 404 on get
	t.Log("verifying sprite is deleted")
	_, err = client.GetSprite(name)
	if err == nil {
		t.Fatal("expected error getting deleted sprite")
	}
	var apiErr *sprites.APIError
	if !errors.As(err, &apiErr) || !apiErr.IsNotFound() {
		t.Errorf("expected 404 error, got: %v", err)
	}
}

// TestSprite_ExecCommand_GivenRunningSprite_ThenReturnsOutput tests command execution.
func TestSprite_ExecCommand_GivenRunningSprite_ThenReturnsOutput(t *testing.T) {
	client := newTestClient(t)
	name := generateTestSpriteName(t)

	registerCleanup(t, client, name)

	// Create and wait for sprite
	_, err := client.CreateSprite(sprites.CreateSpriteRequest{Name: name})
	if err != nil {
		t.Fatalf("failed to create sprite: %v", err)
	}
	waitForSpriteReady(t, client, name, defaultWaitTimeout)

	// Test various commands
	tests := []struct {
		cmd      string
		contains string
	}{
		{"echo hello world", "hello world"},
		{"pwd", "/"},
		{"uname -s", "Linux"},
	}

	for _, tt := range tests {
		t.Run(tt.cmd, func(t *testing.T) {
			output, err := client.ExecCommand(name, tt.cmd)
			if err != nil {
				t.Fatalf("exec %q failed: %v", tt.cmd, err)
			}
			if !strings.Contains(output, tt.contains) {
				t.Errorf("output %q does not contain %q", output, tt.contains)
			}
		})
	}
}

// TestSprite_GetNonexistent_GivenInvalidName_ThenReturns404 tests error handling.
func TestSprite_GetNonexistent_GivenInvalidName_ThenReturns404(t *testing.T) {
	client := newTestClient(t)

	// Use a name that definitely doesn't exist
	name := "e2e-nonexistent-99999999999"

	_, err := client.GetSprite(name)
	if err == nil {
		t.Fatal("expected error getting nonexistent sprite")
	}

	var apiErr *sprites.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected APIError, got %T: %v", err, err)
	}
	if !apiErr.IsNotFound() {
		t.Errorf("expected 404, got status %d: %s", apiErr.StatusCode, apiErr.Message)
	}
}

// TestSprite_ListSprites_GivenTestSprite_ThenAppearsInList tests listing.
func TestSprite_ListSprites_GivenTestSprite_ThenAppearsInList(t *testing.T) {
	client := newTestClient(t)
	name := generateTestSpriteName(t)

	registerCleanup(t, client, name)

	// Create sprite
	_, err := client.CreateSprite(sprites.CreateSpriteRequest{Name: name})
	if err != nil {
		t.Fatalf("failed to create sprite: %v", err)
	}

	// Wait for it to be ready
	waitForSpriteReady(t, client, name, defaultWaitTimeout)

	// List sprites and verify our test sprite appears
	spritesList, err := client.ListSprites()
	if err != nil {
		t.Fatalf("failed to list sprites: %v", err)
	}

	found := false
	for _, s := range spritesList {
		if s.Name == name {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("sprite %s not found in list of %d sprites", name, len(spritesList))
	}
}
