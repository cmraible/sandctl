package hetzner

import (
	"context"
	"crypto/md5" //nolint:gosec // MD5 is required for Hetzner SSH key fingerprints (RFC 4716)
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/hetznercloud/hcloud-go/v2/hcloud"
)

// EnsureSSHKey ensures the given public key exists in Hetzner.
// Returns the Hetzner SSH key ID.
// If a key with the same fingerprint exists, returns its ID.
// Otherwise, creates a new key and returns its ID.
func (c *Client) EnsureSSHKey(ctx context.Context, name, publicKey string) (string, error) {
	// Calculate fingerprint
	fingerprint, err := calculateFingerprint(publicKey)
	if err != nil {
		return "", fmt.Errorf("failed to calculate fingerprint: %w", err)
	}

	// Check if key already exists by fingerprint
	existingKey, _, err := c.hc.SSHKey.GetByFingerprint(ctx, fingerprint)
	if err != nil {
		return "", fmt.Errorf("failed to check existing SSH keys: %w", err)
	}

	if existingKey != nil {
		return fmt.Sprintf("%d", existingKey.ID), nil
	}

	// Create new SSH key
	opts := hcloud.SSHKeyCreateOpts{
		Name:      name,
		PublicKey: publicKey,
	}

	newKey, _, err := c.hc.SSHKey.Create(ctx, opts)
	if err != nil {
		return "", fmt.Errorf("failed to create SSH key: %w", err)
	}

	return fmt.Sprintf("%d", newKey.ID), nil
}

// GetSSHKeyByID retrieves an SSH key by its ID.
func (c *Client) GetSSHKeyByID(ctx context.Context, id int64) (*hcloud.SSHKey, error) {
	key, _, err := c.hc.SSHKey.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get SSH key: %w", err)
	}
	return key, nil
}

// calculateFingerprint calculates the MD5 fingerprint of an SSH public key.
// Format: xx:xx:xx:... (colon-separated hex pairs)
func calculateFingerprint(publicKey string) (string, error) {
	// Parse the public key to extract the base64 part
	parts := strings.Fields(publicKey)
	if len(parts) < 2 {
		return "", fmt.Errorf("invalid public key format")
	}

	// Decode the base64 part
	keyData, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("failed to decode public key: %w", err)
	}

	// Calculate MD5 hash (required by Hetzner API for fingerprint matching)
	hash := md5.Sum(keyData) //nolint:gosec // MD5 required for Hetzner SSH key fingerprints

	// Format as colon-separated hex pairs
	var fp strings.Builder
	for i, b := range hash {
		if i > 0 {
			fp.WriteString(":")
		}
		fmt.Fprintf(&fp, "%02x", b)
	}

	return fp.String(), nil
}
