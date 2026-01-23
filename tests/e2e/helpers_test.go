//go:build e2e

package e2e

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/sandctl/sandctl/internal/sprites"
)

const (
	// testSpritePrefix is used to identify E2E test sprites for easy cleanup.
	testSpritePrefix = "e2e"

	// defaultWaitTimeout is the maximum time to wait for a sprite to become ready.
	defaultWaitTimeout = 2 * time.Minute

	// pollInterval is how often to check sprite status while waiting.
	pollInterval = 2 * time.Second
)

// requireToken fails the test if SPRITES_API_TOKEN is not set.
// This ensures E2E test runs exit with code 1 when not properly configured.
func requireToken(t *testing.T) string {
	t.Helper()
	token := os.Getenv("SPRITES_API_TOKEN")
	if token == "" {
		t.Fatal("SPRITES_API_TOKEN not set - E2E tests require an API token")
	}
	return token
}

// newTestClient creates a new sprites client using the API token from environment.
func newTestClient(t *testing.T) *sprites.Client {
	t.Helper()
	token := requireToken(t)
	return sprites.NewClient(token)
}

// generateTestSpriteName generates a unique sprite name for E2E tests.
// Format: e2e-{random}-{timestamp}
func generateTestSpriteName(t *testing.T) string {
	t.Helper()

	// Generate 4 random bytes for uniqueness
	randomBytes := make([]byte, 4)
	if _, err := rand.Read(randomBytes); err != nil {
		t.Fatalf("failed to generate random bytes: %v", err)
	}
	randomHex := hex.EncodeToString(randomBytes)

	// Use Unix timestamp for ordering
	timestamp := time.Now().Unix()

	return fmt.Sprintf("%s-%s-%d", testSpritePrefix, randomHex, timestamp)
}

// waitForSpriteReady polls until the sprite reaches a ready state or times out.
func waitForSpriteReady(t *testing.T, client *sprites.Client, name string, timeout time.Duration) *sprites.Sprite {
	t.Helper()

	deadline := time.Now().Add(timeout)
	var lastSprite *sprites.Sprite
	var lastErr error

	for time.Now().Before(deadline) {
		sprite, err := client.GetSprite(name)
		if err != nil {
			lastErr = err
			t.Logf("waiting for sprite %s: %v", name, err)
			time.Sleep(pollInterval)
			continue
		}

		lastSprite = sprite
		lastErr = nil

		// Check if sprite is ready
		// Accept "running" or "ready" as ready states
		if sprite.State == "running" || sprite.State == "ready" {
			t.Logf("sprite %s is ready (state: %s)", name, sprite.State)
			return sprite
		}

		// Check for failure states
		if sprite.State == "failed" || sprite.State == "error" {
			t.Fatalf("sprite %s entered failure state: %s", name, sprite.State)
		}

		t.Logf("sprite %s state: %s, waiting...", name, sprite.State)
		time.Sleep(pollInterval)
	}

	if lastErr != nil {
		t.Fatalf("timeout waiting for sprite %s to be ready: %v", name, lastErr)
	}
	if lastSprite != nil {
		t.Fatalf("timeout waiting for sprite %s to be ready (last state: %s)", name, lastSprite.State)
	}
	t.Fatalf("timeout waiting for sprite %s to be ready", name)
	return nil
}

// registerCleanup registers a cleanup function to delete the sprite when the test completes.
// This ensures sprites are cleaned up even if the test fails.
func registerCleanup(t *testing.T, client *sprites.Client, name string) {
	t.Helper()
	t.Cleanup(func() {
		t.Logf("cleaning up sprite: %s", name)
		if err := client.DeleteSprite(name); err != nil {
			// Don't fail on cleanup errors - the sprite might already be deleted
			var apiErr *sprites.APIError
			if errors.As(err, &apiErr) && apiErr.IsNotFound() {
				t.Logf("sprite %s already deleted", name)
				return
			}
			t.Logf("warning: failed to cleanup sprite %s: %v", name, err)
		}
	})
}
