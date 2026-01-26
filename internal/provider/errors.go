// Package provider defines the contract and types for VM providers.
package provider

import "errors"

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
