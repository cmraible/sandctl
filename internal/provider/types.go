package provider

import "time"

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
