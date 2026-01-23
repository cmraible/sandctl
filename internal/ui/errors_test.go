package ui

import (
	"bytes"
	"strings"
	"testing"

	"github.com/sandctl/sandctl/internal/config"
	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sprites"
)

// TestFormatError_GivenNil_ThenReturnsSuccess tests nil error handling.
func TestFormatError_GivenNil_ThenReturnsSuccess(t *testing.T) {
	var buf bytes.Buffer

	code := FormatError(&buf, nil)

	if code != ExitSuccess {
		t.Errorf("exit code = %d, want %d", code, ExitSuccess)
	}
	if buf.Len() != 0 {
		t.Errorf("expected no output, got: %q", buf.String())
	}
}

// TestFormatError_GivenConfigNotFoundError_ThenReturnsConfigError tests config not found.
func TestFormatError_GivenConfigNotFoundError_ThenReturnsConfigError(t *testing.T) {
	var buf bytes.Buffer
	err := &config.NotFoundError{Path: "/path/to/config"}

	code := FormatError(&buf, err)

	if code != ExitConfigError {
		t.Errorf("exit code = %d, want %d", code, ExitConfigError)
	}

	output := buf.String()
	if !strings.Contains(output, "Configuration file not found") {
		t.Errorf("output should mention config not found, got: %q", output)
	}
	if !strings.Contains(output, "sprites_token") {
		t.Error("output should contain setup instructions")
	}
}

// TestFormatError_GivenInsecurePermissionsError_ThenReturnsConfigError tests insecure perms.
func TestFormatError_GivenInsecurePermissionsError_ThenReturnsConfigError(t *testing.T) {
	var buf bytes.Buffer
	err := &config.InsecurePermissionsError{
		Path:     "/path/to/config",
		Mode:     0644,
		Expected: 0600,
	}

	code := FormatError(&buf, err)

	if code != ExitConfigError {
		t.Errorf("exit code = %d, want %d", code, ExitConfigError)
	}

	output := buf.String()
	if !strings.Contains(output, "insecure permissions") {
		t.Errorf("output should mention insecure permissions, got: %q", output)
	}
	if !strings.Contains(output, "chmod 600") {
		t.Error("output should contain fix command")
	}
}

// TestFormatError_GivenValidationError_ThenReturnsConfigError tests validation error.
func TestFormatError_GivenValidationError_ThenReturnsConfigError(t *testing.T) {
	var buf bytes.Buffer
	err := &config.ValidationError{
		Field:   "sprites_token",
		Message: "is required",
	}

	code := FormatError(&buf, err)

	if code != ExitConfigError {
		t.Errorf("exit code = %d, want %d", code, ExitConfigError)
	}

	output := buf.String()
	if !strings.Contains(output, "Invalid configuration") {
		t.Errorf("output should mention invalid configuration, got: %q", output)
	}
	if !strings.Contains(output, "sprites_token") {
		t.Error("output should mention the field")
	}
}

// TestFormatError_GivenNotFoundError_ThenReturnsSessionNotFound tests session not found.
func TestFormatError_GivenNotFoundError_ThenReturnsSessionNotFound(t *testing.T) {
	var buf bytes.Buffer
	err := &session.NotFoundError{ID: "sandctl-test1234"}

	code := FormatError(&buf, err)

	if code != ExitSessionNotFound {
		t.Errorf("exit code = %d, want %d", code, ExitSessionNotFound)
	}

	output := buf.String()
	if !strings.Contains(output, "sandctl-test1234") {
		t.Errorf("output should contain session ID, got: %q", output)
	}
	if !strings.Contains(output, "sandctl list") {
		t.Error("output should suggest list command")
	}
}

// TestFormatError_GivenAPIAuthError_ThenReturnsAPIError tests auth error.
func TestFormatError_GivenAPIAuthError_ThenReturnsAPIError(t *testing.T) {
	var buf bytes.Buffer
	err := &sprites.APIError{StatusCode: 401, Message: "unauthorized"}

	code := FormatError(&buf, err)

	if code != ExitAPIError {
		t.Errorf("exit code = %d, want %d", code, ExitAPIError)
	}

	output := buf.String()
	if !strings.Contains(output, "Authentication failed") {
		t.Errorf("output should mention auth failed, got: %q", output)
	}
	if !strings.Contains(output, "sprites.dev/tokens") {
		t.Error("output should mention where to get new token")
	}
}

// TestFormatError_GivenAPIQuotaError_ThenReturnsAPIError tests quota error.
func TestFormatError_GivenAPIQuotaError_ThenReturnsAPIError(t *testing.T) {
	var buf bytes.Buffer
	err := &sprites.APIError{StatusCode: 429, Message: "rate limited"}

	code := FormatError(&buf, err)

	if code != ExitAPIError {
		t.Errorf("exit code = %d, want %d", code, ExitAPIError)
	}

	output := buf.String()
	if !strings.Contains(output, "Quota exceeded") {
		t.Errorf("output should mention quota exceeded, got: %q", output)
	}
}

// TestFormatError_GivenAPINotFoundError_ThenReturnsSessionNotFound tests API 404.
func TestFormatError_GivenAPINotFoundError_ThenReturnsSessionNotFound(t *testing.T) {
	var buf bytes.Buffer
	err := &sprites.APIError{StatusCode: 404, Message: "sprite not found"}

	code := FormatError(&buf, err)

	if code != ExitSessionNotFound {
		t.Errorf("exit code = %d, want %d", code, ExitSessionNotFound)
	}

	output := buf.String()
	if !strings.Contains(output, "Resource not found") {
		t.Errorf("output should mention not found, got: %q", output)
	}
}

// TestFormatError_GivenGenericAPIError_ThenReturnsAPIError tests generic API error.
func TestFormatError_GivenGenericAPIError_ThenReturnsAPIError(t *testing.T) {
	var buf bytes.Buffer
	err := &sprites.APIError{StatusCode: 500, Message: "internal server error"}

	code := FormatError(&buf, err)

	if code != ExitAPIError {
		t.Errorf("exit code = %d, want %d", code, ExitAPIError)
	}

	output := buf.String()
	if !strings.Contains(output, "API error") {
		t.Errorf("output should mention API error, got: %q", output)
	}
	if !strings.Contains(output, "internal server error") {
		t.Error("output should contain error message")
	}
}

// TestFormatError_GivenGenericError_ThenReturnsGeneralError tests generic error.
func TestFormatError_GivenGenericError_ThenReturnsGeneralError(t *testing.T) {
	var buf bytes.Buffer
	err := &testError{msg: "something went wrong"}

	code := FormatError(&buf, err)

	if code != ExitGeneralError {
		t.Errorf("exit code = %d, want %d", code, ExitGeneralError)
	}

	output := buf.String()
	if !strings.Contains(output, "something went wrong") {
		t.Errorf("output should contain error message, got: %q", output)
	}
}

// TestFormatSessionNotRunning_GivenIDAndStatus_ThenReturnsFormattedOutput tests not running format.
func TestFormatSessionNotRunning_GivenIDAndStatus_ThenReturnsFormattedOutput(t *testing.T) {
	var buf bytes.Buffer

	code := FormatSessionNotRunning(&buf, "sandctl-test1234", session.StatusStopped)

	if code != ExitSessionNotReady {
		t.Errorf("exit code = %d, want %d", code, ExitSessionNotReady)
	}

	output := buf.String()
	if !strings.Contains(output, "sandctl-test1234") {
		t.Errorf("output should contain session ID, got: %q", output)
	}
	if !strings.Contains(output, "stopped") {
		t.Errorf("output should contain status, got: %q", output)
	}
	if !strings.Contains(output, "not running") {
		t.Error("output should mention not running")
	}
}

// TestSessionNotRunningError_Error_GivenValues_ThenReturnsFormattedMessage tests error message.
func TestSessionNotRunningError_Error_GivenValues_ThenReturnsFormattedMessage(t *testing.T) {
	err := &SessionNotRunningError{
		ID:     "sandctl-test1234",
		Status: session.StatusStopped,
	}

	msg := err.Error()

	expected := "session 'sandctl-test1234' is not running (status: stopped)"
	if msg != expected {
		t.Errorf("Error() = %q, want %q", msg, expected)
	}
}

// TestExitCodes_GivenConstants_ThenHaveExpectedValues tests exit code values.
func TestExitCodes_GivenConstants_ThenHaveExpectedValues(t *testing.T) {
	tests := []struct {
		name     string
		code     int
		expected int
	}{
		{"ExitSuccess", ExitSuccess, 0},
		{"ExitGeneralError", ExitGeneralError, 1},
		{"ExitConfigError", ExitConfigError, 2},
		{"ExitAPIError", ExitAPIError, 3},
		{"ExitSessionNotFound", ExitSessionNotFound, 4},
		{"ExitSessionNotReady", ExitSessionNotReady, 5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.code != tt.expected {
				t.Errorf("%s = %d, want %d", tt.name, tt.code, tt.expected)
			}
		})
	}
}

// testError is a simple error type for testing.
type testError struct {
	msg string
}

func (e *testError) Error() string {
	return e.msg
}
