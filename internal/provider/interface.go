package provider

import (
	"context"
	"time"
)

// Provider defines the contract for VM providers.
// Each provider implementation (Hetzner, AWS, GCP) must satisfy this interface.
type Provider interface {
	// Name returns the provider identifier (e.g., "hetzner", "aws", "gcp").
	Name() string

	// Create provisions a new VM with the given options.
	// Returns the VM with at least ID and Name populated.
	// The VM may still be provisioning; use WaitReady to wait for SSH access.
	Create(ctx context.Context, opts CreateOpts) (*VM, error)

	// Get retrieves a VM by its provider-specific ID.
	// Returns ErrNotFound if the VM does not exist.
	Get(ctx context.Context, id string) (*VM, error)

	// Delete terminates and removes a VM.
	// Returns ErrNotFound if the VM does not exist.
	// Deletion is idempotent; deleting an already-deleted VM is not an error.
	Delete(ctx context.Context, id string) error

	// List returns all VMs managed by this provider.
	// Used for syncing local session state with provider state.
	List(ctx context.Context) ([]*VM, error)

	// WaitReady blocks until the VM is ready for SSH access or timeout expires.
	// Returns ErrTimeout if the VM is not ready within the timeout.
	// Returns ErrProvisionFailed if the VM enters a failed state.
	WaitReady(ctx context.Context, id string, timeout time.Duration) error
}

// SSHKeyManager handles SSH key lifecycle for a provider.
// This is separate from Provider because not all providers need it.
type SSHKeyManager interface {
	// EnsureSSHKey ensures the given public key exists in the provider.
	// Returns the provider's SSH key identifier.
	// If a key with the same fingerprint exists, returns its ID.
	// Otherwise, creates a new key and returns its ID.
	EnsureSSHKey(ctx context.Context, name, publicKey string) (keyID string, err error)
}
