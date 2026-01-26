// Package provider defines the contract for VM providers.
// This file is a design artifact, not production code.
// The actual implementation will be in internal/provider/.
package provider

import (
	"context"
	"errors"
	"time"
)

// Common errors returned by providers.
// CLI code should check for these to provide consistent user messages.
var (
	// ErrNotFound indicates the VM does not exist.
	ErrNotFound = errors.New("vm not found")

	// ErrAuthFailed indicates invalid or expired credentials.
	ErrAuthFailed = errors.New("authentication failed")

	// ErrQuotaExceeded indicates the provider account has reached its limit.
	ErrQuotaExceeded = errors.New("quota exceeded")

	// ErrProvisionFailed indicates VM creation failed.
	ErrProvisionFailed = errors.New("provisioning failed")

	// ErrTimeout indicates an operation exceeded its time limit.
	ErrTimeout = errors.New("operation timed out")
)

// VMStatus represents the state of a virtual machine.
type VMStatus string

const (
	StatusProvisioning VMStatus = "provisioning"
	StatusStarting     VMStatus = "starting"
	StatusRunning      VMStatus = "running"
	StatusStopping     VMStatus = "stopping"
	StatusStopped      VMStatus = "stopped"
	StatusDeleting     VMStatus = "deleting"
	StatusFailed       VMStatus = "failed"
)

// VM represents a provider-agnostic virtual machine.
type VM struct {
	// ID is the provider-specific identifier.
	ID string

	// Name is the human-readable name (matches session ID).
	Name string

	// Status is the current VM state.
	Status VMStatus

	// IPAddress is the public IPv4 address for SSH access.
	IPAddress string

	// CreatedAt is when the VM was created.
	CreatedAt time.Time

	// Region is the datacenter location.
	Region string

	// ServerType is the hardware configuration.
	ServerType string
}

// CreateOpts specifies options for creating a new VM.
type CreateOpts struct {
	// Name is required and becomes the VM's name.
	Name string

	// SSHKeyID is the provider's SSH key identifier to install.
	SSHKeyID string

	// Region overrides the default datacenter location.
	Region string

	// ServerType overrides the default hardware configuration.
	ServerType string

	// Image overrides the default OS image.
	Image string

	// UserData is an optional cloud-init script.
	UserData string
}

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
