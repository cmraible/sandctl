// Package session handles session types and local session storage.
package session

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/sandctl/sandctl/internal/config"
)

// Status represents the current state of a session.
type Status string

const (
	StatusProvisioning Status = "provisioning"
	StatusRunning      Status = "running"
	StatusStopped      Status = "stopped"
	StatusFailed       Status = "failed"
)

// IsActive returns true if the session is in an active state.
func (s Status) IsActive() bool {
	return s == StatusProvisioning || s == StatusRunning
}

// IsTerminal returns true if the session is in a terminal state.
func (s Status) IsTerminal() bool {
	return s == StatusStopped || s == StatusFailed
}

// String returns the string representation of the status.
func (s Status) String() string {
	return string(s)
}

// Duration wraps time.Duration for JSON marshaling.
type Duration struct {
	time.Duration
}

// MarshalJSON implements json.Marshaler.
func (d Duration) MarshalJSON() ([]byte, error) {
	return json.Marshal(d.String())
}

// UnmarshalJSON implements json.Unmarshaler.
func (d *Duration) UnmarshalJSON(b []byte) error {
	var v interface{}
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	switch value := v.(type) {
	case float64:
		d.Duration = time.Duration(value)
		return nil
	case string:
		var err error
		d.Duration, err = time.ParseDuration(value)
		if err != nil {
			return err
		}
		return nil
	default:
		return fmt.Errorf("invalid duration: %v", v)
	}
}

// Session represents a sandboxed VM instance managed by sandctl.
type Session struct {
	ID        string           `json:"id"`
	Agent     config.AgentType `json:"agent"`
	Prompt    string           `json:"prompt"`
	Status    Status           `json:"status"`
	CreatedAt time.Time        `json:"created_at"`
	Timeout   *Duration        `json:"timeout,omitempty"`
}

// IsRunning returns true if the session is in running state.
func (s *Session) IsRunning() bool {
	return s.Status == StatusRunning
}

// CanConnect returns true if the session can accept connections.
func (s *Session) CanConnect() bool {
	return s.Status == StatusRunning
}

// TimeoutRemaining returns the remaining time before auto-destroy, or nil if no timeout.
func (s *Session) TimeoutRemaining() *time.Duration {
	if s.Timeout == nil {
		return nil
	}
	deadline := s.CreatedAt.Add(s.Timeout.Duration)
	remaining := time.Until(deadline)
	if remaining < 0 {
		remaining = 0
	}
	return &remaining
}

// Age returns how long the session has been running.
func (s *Session) Age() time.Duration {
	return time.Since(s.CreatedAt)
}

// Validate checks that the session has valid field values.
func (s *Session) Validate() error {
	if s.ID == "" {
		return fmt.Errorf("session ID is required")
	}
	if !s.Agent.IsValid() {
		return fmt.Errorf("invalid agent type: %s", s.Agent)
	}
	if s.Prompt == "" {
		return fmt.Errorf("prompt is required")
	}
	if len(s.Prompt) > 10000 {
		return fmt.Errorf("prompt exceeds maximum length of 10000 characters")
	}
	return nil
}
