package session

import (
	"encoding/json"
	"testing"
	"time"
)

// TestStatus_IsActive_GivenActiveStatuses_ThenReturnsTrue tests active status detection.
func TestStatus_IsActive_GivenActiveStatuses_ThenReturnsTrue(t *testing.T) {
	activeStatuses := []Status{StatusProvisioning, StatusRunning}

	for _, status := range activeStatuses {
		t.Run(string(status), func(t *testing.T) {
			if !status.IsActive() {
				t.Errorf("expected %q to be active", status)
			}
		})
	}
}

// TestStatus_IsActive_GivenTerminalStatuses_ThenReturnsFalse tests inactive status detection.
func TestStatus_IsActive_GivenTerminalStatuses_ThenReturnsFalse(t *testing.T) {
	terminalStatuses := []Status{StatusStopped, StatusFailed}

	for _, status := range terminalStatuses {
		t.Run(string(status), func(t *testing.T) {
			if status.IsActive() {
				t.Errorf("expected %q to not be active", status)
			}
		})
	}
}

// TestStatus_IsTerminal_GivenTerminalStatuses_ThenReturnsTrue tests terminal status detection.
func TestStatus_IsTerminal_GivenTerminalStatuses_ThenReturnsTrue(t *testing.T) {
	terminalStatuses := []Status{StatusStopped, StatusFailed}

	for _, status := range terminalStatuses {
		t.Run(string(status), func(t *testing.T) {
			if !status.IsTerminal() {
				t.Errorf("expected %q to be terminal", status)
			}
		})
	}
}

// TestStatus_IsTerminal_GivenActiveStatuses_ThenReturnsFalse tests non-terminal status detection.
func TestStatus_IsTerminal_GivenActiveStatuses_ThenReturnsFalse(t *testing.T) {
	activeStatuses := []Status{StatusProvisioning, StatusRunning}

	for _, status := range activeStatuses {
		t.Run(string(status), func(t *testing.T) {
			if status.IsTerminal() {
				t.Errorf("expected %q to not be terminal", status)
			}
		})
	}
}

// TestStatus_String_GivenStatus_ThenReturnsStringValue tests string conversion.
func TestStatus_String_GivenStatus_ThenReturnsStringValue(t *testing.T) {
	tests := []struct {
		status   Status
		expected string
	}{
		{StatusProvisioning, "provisioning"},
		{StatusRunning, "running"},
		{StatusStopped, "stopped"},
		{StatusFailed, "failed"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			if got := tt.status.String(); got != tt.expected {
				t.Errorf("String() = %q, want %q", got, tt.expected)
			}
		})
	}
}

// TestDuration_MarshalJSON_GivenDuration_ThenReturnsString tests JSON marshaling.
func TestDuration_MarshalJSON_GivenDuration_ThenReturnsString(t *testing.T) {
	tests := []struct {
		name     string
		duration Duration
		expected string
	}{
		{"1 hour", Duration{time.Hour}, `"1h0m0s"`},
		{"30 minutes", Duration{30 * time.Minute}, `"30m0s"`},
		{"5 seconds", Duration{5 * time.Second}, `"5s"`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.duration)
			if err != nil {
				t.Fatalf("Marshal() error = %v", err)
			}
			if string(data) != tt.expected {
				t.Errorf("Marshal() = %s, want %s", data, tt.expected)
			}
		})
	}
}

// TestDuration_UnmarshalJSON_GivenString_ThenParsesDuration tests JSON unmarshaling from string.
func TestDuration_UnmarshalJSON_GivenString_ThenParsesDuration(t *testing.T) {
	tests := []struct {
		name     string
		json     string
		expected time.Duration
	}{
		{"1 hour", `"1h"`, time.Hour},
		{"30 minutes", `"30m"`, 30 * time.Minute},
		{"1h30m", `"1h30m"`, 90 * time.Minute},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var d Duration
			if err := json.Unmarshal([]byte(tt.json), &d); err != nil {
				t.Fatalf("Unmarshal() error = %v", err)
			}
			if d.Duration != tt.expected {
				t.Errorf("Unmarshal() = %v, want %v", d.Duration, tt.expected)
			}
		})
	}
}

// TestDuration_UnmarshalJSON_GivenNumber_ThenParsesNanoseconds tests JSON unmarshaling from number.
func TestDuration_UnmarshalJSON_GivenNumber_ThenParsesNanoseconds(t *testing.T) {
	var d Duration
	// 3600000000000 nanoseconds = 1 hour
	if err := json.Unmarshal([]byte(`3600000000000`), &d); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if d.Duration != time.Hour {
		t.Errorf("Unmarshal() = %v, want %v", d.Duration, time.Hour)
	}
}

// TestDuration_UnmarshalJSON_GivenInvalidString_ThenReturnsError tests invalid duration handling.
func TestDuration_UnmarshalJSON_GivenInvalidString_ThenReturnsError(t *testing.T) {
	var d Duration
	err := json.Unmarshal([]byte(`"invalid"`), &d)
	if err == nil {
		t.Error("expected error for invalid duration string")
	}
}

// TestDuration_UnmarshalJSON_GivenInvalidType_ThenReturnsError tests invalid type handling.
func TestDuration_UnmarshalJSON_GivenInvalidType_ThenReturnsError(t *testing.T) {
	var d Duration
	err := json.Unmarshal([]byte(`true`), &d)
	if err == nil {
		t.Error("expected error for invalid type")
	}
}

// TestSession_IsRunning_GivenRunningStatus_ThenReturnsTrue tests running detection.
func TestSession_IsRunning_GivenRunningStatus_ThenReturnsTrue(t *testing.T) {
	s := &Session{Status: StatusRunning}

	if !s.IsRunning() {
		t.Error("expected IsRunning() to return true")
	}
}

// TestSession_IsRunning_GivenNonRunningStatus_ThenReturnsFalse tests non-running detection.
func TestSession_IsRunning_GivenNonRunningStatus_ThenReturnsFalse(t *testing.T) {
	statuses := []Status{StatusProvisioning, StatusStopped, StatusFailed}

	for _, status := range statuses {
		t.Run(string(status), func(t *testing.T) {
			s := &Session{Status: status}
			if s.IsRunning() {
				t.Errorf("expected IsRunning() to return false for %q", status)
			}
		})
	}
}

// TestSession_CanConnect_GivenRunningStatus_ThenReturnsTrue tests connection check.
func TestSession_CanConnect_GivenRunningStatus_ThenReturnsTrue(t *testing.T) {
	s := &Session{Status: StatusRunning}

	if !s.CanConnect() {
		t.Error("expected CanConnect() to return true")
	}
}

// TestSession_CanConnect_GivenNonRunningStatus_ThenReturnsFalse tests connection check for non-running.
func TestSession_CanConnect_GivenNonRunningStatus_ThenReturnsFalse(t *testing.T) {
	statuses := []Status{StatusProvisioning, StatusStopped, StatusFailed}

	for _, status := range statuses {
		t.Run(string(status), func(t *testing.T) {
			s := &Session{Status: status}
			if s.CanConnect() {
				t.Errorf("expected CanConnect() to return false for %q", status)
			}
		})
	}
}

// TestSession_TimeoutRemaining_GivenNoTimeout_ThenReturnsNil tests nil timeout handling.
func TestSession_TimeoutRemaining_GivenNoTimeout_ThenReturnsNil(t *testing.T) {
	s := &Session{
		Timeout:   nil,
		CreatedAt: time.Now(),
	}

	if remaining := s.TimeoutRemaining(); remaining != nil {
		t.Errorf("expected nil, got %v", remaining)
	}
}

// TestSession_TimeoutRemaining_GivenFutureDeadline_ThenReturnsPositiveDuration tests future timeout.
func TestSession_TimeoutRemaining_GivenFutureDeadline_ThenReturnsPositiveDuration(t *testing.T) {
	s := &Session{
		Timeout:   &Duration{time.Hour},
		CreatedAt: time.Now(),
	}

	remaining := s.TimeoutRemaining()

	if remaining == nil {
		t.Fatal("expected non-nil remaining")
	}
	if *remaining <= 0 {
		t.Errorf("expected positive duration, got %v", *remaining)
	}
	if *remaining > time.Hour {
		t.Errorf("expected at most 1 hour, got %v", *remaining)
	}
}

// TestSession_TimeoutRemaining_GivenPastDeadline_ThenReturnsZero tests expired timeout.
func TestSession_TimeoutRemaining_GivenPastDeadline_ThenReturnsZero(t *testing.T) {
	s := &Session{
		Timeout:   &Duration{time.Minute},
		CreatedAt: time.Now().Add(-2 * time.Minute), // Created 2 minutes ago with 1 minute timeout
	}

	remaining := s.TimeoutRemaining()

	if remaining == nil {
		t.Fatal("expected non-nil remaining")
	}
	if *remaining != 0 {
		t.Errorf("expected 0, got %v", *remaining)
	}
}

// TestSession_Validate_GivenValidSession_ThenReturnsNil tests valid session.
func TestSession_Validate_GivenValidSession_ThenReturnsNil(t *testing.T) {
	s := &Session{
		ID: "sandctl-abc12345",
	}

	if err := s.Validate(); err != nil {
		t.Errorf("Validate() error = %v", err)
	}
}

// TestSession_Validate_GivenEmptyID_ThenReturnsError tests empty ID validation.
func TestSession_Validate_GivenEmptyID_ThenReturnsError(t *testing.T) {
	s := &Session{
		ID: "",
	}

	err := s.Validate()

	if err == nil {
		t.Error("expected error for empty ID")
	}
}
