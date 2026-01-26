package ui

import (
	"errors"
	"fmt"
	"io"

	"github.com/sandctl/sandctl/internal/config"
	"github.com/sandctl/sandctl/internal/provider"
	"github.com/sandctl/sandctl/internal/session"
)

// Exit codes as defined in the CLI contract.
const (
	ExitSuccess         = 0
	ExitGeneralError    = 1
	ExitConfigError     = 2
	ExitAPIError        = 3
	ExitSessionNotFound = 4
	ExitSessionNotReady = 5
)

// FormatError formats an error for user-friendly display and returns the appropriate exit code.
func FormatError(writer io.Writer, err error) int {
	if err == nil {
		return ExitSuccess
	}

	// Check for specific error types and provide helpful messages
	var configNotFound *config.NotFoundError
	if errors.As(err, &configNotFound) {
		PrintError(writer, "Configuration file not found")
		fmt.Fprintln(writer)
		fmt.Fprint(writer, config.SetupInstructions())
		return ExitConfigError
	}

	var insecurePerms *config.InsecurePermissionsError
	if errors.As(err, &insecurePerms) {
		PrintError(writer, "Configuration file has insecure permissions")
		fmt.Fprintln(writer)
		fmt.Fprintf(writer, "Current permissions: %04o\n", insecurePerms.Mode)
		fmt.Fprintf(writer, "Required permissions: %04o\n", insecurePerms.Expected)
		fmt.Fprintln(writer)
		fmt.Fprintf(writer, "Fix with: chmod 600 %s\n", insecurePerms.Path)
		return ExitConfigError
	}

	var configValidation *config.ValidationError
	if errors.As(err, &configValidation) {
		PrintError(writer, "Invalid configuration: %s %s", configValidation.Field, configValidation.Message)
		fmt.Fprintln(writer)
		fmt.Fprint(writer, config.SetupInstructions())
		return ExitConfigError
	}

	var sessionNotFound *session.NotFoundError
	if errors.As(err, &sessionNotFound) {
		PrintError(writer, "session '%s' not found", sessionNotFound.ID)
		fmt.Fprintln(writer)
		fmt.Fprintln(writer, "Use 'sandctl list' to see active sessions.")
		return ExitSessionNotFound
	}

	// Check for provider errors
	if errors.Is(err, provider.ErrAuthFailed) {
		PrintError(writer, "Authentication failed")
		fmt.Fprintln(writer)
		fmt.Fprintln(writer, "Your provider API token may be invalid or expired.")
		fmt.Fprintln(writer, "Run 'sandctl init' to update your credentials.")
		return ExitAPIError
	}

	if errors.Is(err, provider.ErrQuotaExceeded) {
		PrintError(writer, "Quota exceeded")
		fmt.Fprintln(writer)
		fmt.Fprintln(writer, "Your provider account has reached its server limit.")
		fmt.Fprintln(writer, "Destroy unused sessions or request a quota increase.")
		return ExitAPIError
	}

	if errors.Is(err, provider.ErrNotFound) {
		PrintError(writer, "Resource not found")
		return ExitSessionNotFound
	}

	if errors.Is(err, provider.ErrProvisionFailed) {
		PrintError(writer, "VM provisioning failed")
		fmt.Fprintln(writer)
		fmt.Fprintln(writer, "The VM could not be created. Check your provider console for details.")
		return ExitAPIError
	}

	if errors.Is(err, provider.ErrTimeout) {
		PrintError(writer, "Operation timed out")
		fmt.Fprintln(writer)
		fmt.Fprintln(writer, "The operation took too long. The VM may still be provisioning.")
		return ExitAPIError
	}

	// Generic error
	PrintError(writer, "%v", err)
	return ExitGeneralError
}

// SessionNotRunningError is returned when trying to connect to a non-running session.
type SessionNotRunningError struct {
	ID     string
	Status session.Status
}

func (e *SessionNotRunningError) Error() string {
	return fmt.Sprintf("session '%s' is not running (status: %s)", e.ID, e.Status)
}

// FormatSessionNotRunning formats the session not running error.
func FormatSessionNotRunning(writer io.Writer, id string, status session.Status) int {
	PrintError(writer, "session '%s' is not running (status: %s)", id, status)
	fmt.Fprintln(writer)
	fmt.Fprintln(writer, "Cannot connect to stopped sessions.")
	return ExitSessionNotReady
}
