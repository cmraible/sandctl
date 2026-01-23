package ui

import (
	"bytes"
	"errors"
	"strings"
	"testing"
)

// TestNewSpinner_GivenNilWriter_ThenUsesStdout tests nil writer handling.
func TestNewSpinner_GivenNilWriter_ThenUsesStdout(t *testing.T) {
	spinner := NewSpinner(nil)

	if spinner == nil {
		t.Fatal("expected non-nil spinner")
	}
	if spinner.spinner == nil {
		t.Error("expected internal spinner to be initialized")
	}
}

// TestNewSpinner_GivenWriter_ThenUsesWriter tests custom writer.
func TestNewSpinner_GivenWriter_ThenUsesWriter(t *testing.T) {
	var buf bytes.Buffer
	spinner := NewSpinner(&buf)

	if spinner == nil {
		t.Fatal("expected non-nil spinner")
	}
	if spinner.writer != &buf {
		t.Error("expected writer to be set")
	}
}

// TestSpinner_Success_GivenMessage_ThenWritesSuccessFormat tests success output.
func TestSpinner_Success_GivenMessage_ThenWritesSuccessFormat(t *testing.T) {
	var buf bytes.Buffer
	spinner := NewSpinner(&buf)

	spinner.Success("Operation completed")

	output := buf.String()
	if !strings.Contains(output, "✓") {
		t.Errorf("output should contain checkmark, got: %q", output)
	}
	if !strings.Contains(output, "Operation completed") {
		t.Errorf("output should contain message, got: %q", output)
	}
}

// TestSpinner_Fail_GivenMessage_ThenWritesFailFormat tests failure output.
func TestSpinner_Fail_GivenMessage_ThenWritesFailFormat(t *testing.T) {
	var buf bytes.Buffer
	spinner := NewSpinner(&buf)

	spinner.Fail("Operation failed")

	output := buf.String()
	if !strings.Contains(output, "✗") {
		t.Errorf("output should contain X mark, got: %q", output)
	}
	if !strings.Contains(output, "Operation failed") {
		t.Errorf("output should contain message, got: %q", output)
	}
}

// TestRunSteps_GivenAllSuccess_ThenReturnsNil tests successful steps.
func TestRunSteps_GivenAllSuccess_ThenReturnsNil(t *testing.T) {
	var buf bytes.Buffer
	executedSteps := []string{}

	steps := []ProgressStep{
		{
			Message: "Step 1",
			Action: func() error {
				executedSteps = append(executedSteps, "1")
				return nil
			},
		},
		{
			Message: "Step 2",
			Action: func() error {
				executedSteps = append(executedSteps, "2")
				return nil
			},
		},
	}

	err := RunSteps(&buf, steps)

	if err != nil {
		t.Errorf("RunSteps() error = %v", err)
	}
	if len(executedSteps) != 2 {
		t.Errorf("expected 2 steps executed, got %d", len(executedSteps))
	}
}

// TestRunSteps_GivenStepFails_ThenReturnsError tests step failure.
func TestRunSteps_GivenStepFails_ThenReturnsError(t *testing.T) {
	var buf bytes.Buffer
	expectedErr := errors.New("step failed")

	steps := []ProgressStep{
		{
			Message: "Step 1",
			Action:  func() error { return nil },
		},
		{
			Message: "Failing step",
			Action:  func() error { return expectedErr },
		},
		{
			Message: "Step 3",
			Action:  func() error { return nil },
		},
	}

	err := RunSteps(&buf, steps)

	if err != expectedErr {
		t.Errorf("RunSteps() error = %v, want %v", err, expectedErr)
	}
}

// TestRunSteps_GivenStepFails_ThenStopsExecution tests early termination.
func TestRunSteps_GivenStepFails_ThenStopsExecution(t *testing.T) {
	var buf bytes.Buffer
	executedSteps := []string{}

	steps := []ProgressStep{
		{
			Message: "Step 1",
			Action: func() error {
				executedSteps = append(executedSteps, "1")
				return nil
			},
		},
		{
			Message: "Failing step",
			Action: func() error {
				executedSteps = append(executedSteps, "2")
				return errors.New("failed")
			},
		},
		{
			Message: "Step 3",
			Action: func() error {
				executedSteps = append(executedSteps, "3")
				return nil
			},
		},
	}

	_ = RunSteps(&buf, steps)

	// Step 3 should not have executed
	if len(executedSteps) != 2 {
		t.Errorf("expected 2 steps executed, got %d", len(executedSteps))
	}
	for _, s := range executedSteps {
		if s == "3" {
			t.Error("step 3 should not have executed after failure")
		}
	}
}

// TestPrintSuccess_GivenFormat_ThenWritesFormattedMessage tests success printing.
func TestPrintSuccess_GivenFormat_ThenWritesFormattedMessage(t *testing.T) {
	var buf bytes.Buffer

	PrintSuccess(&buf, "Created %s session", "new")

	output := buf.String()
	if !strings.Contains(output, "✓") {
		t.Errorf("output should contain checkmark, got: %q", output)
	}
	if !strings.Contains(output, "Created new session") {
		t.Errorf("output should contain formatted message, got: %q", output)
	}
}

// TestPrintError_GivenFormat_ThenWritesFormattedMessage tests error printing.
func TestPrintError_GivenFormat_ThenWritesFormattedMessage(t *testing.T) {
	var buf bytes.Buffer

	PrintError(&buf, "Failed to connect: %s", "timeout")

	output := buf.String()
	if !strings.Contains(output, "Error:") {
		t.Errorf("output should contain 'Error:', got: %q", output)
	}
	if !strings.Contains(output, "Failed to connect: timeout") {
		t.Errorf("output should contain formatted message, got: %q", output)
	}
}

// TestPrintWarning_GivenFormat_ThenWritesFormattedMessage tests warning printing.
func TestPrintWarning_GivenFormat_ThenWritesFormattedMessage(t *testing.T) {
	var buf bytes.Buffer

	PrintWarning(&buf, "Session %s may be stale", "abc123")

	output := buf.String()
	if !strings.Contains(output, "Warning:") {
		t.Errorf("output should contain 'Warning:', got: %q", output)
	}
	if !strings.Contains(output, "Session abc123 may be stale") {
		t.Errorf("output should contain formatted message, got: %q", output)
	}
}

// TestPrintInfo_GivenFormat_ThenWritesFormattedMessage tests info printing.
func TestPrintInfo_GivenFormat_ThenWritesFormattedMessage(t *testing.T) {
	var buf bytes.Buffer

	PrintInfo(&buf, "Session ID: %s", "sandctl-test1234")

	output := buf.String()
	if !strings.Contains(output, "Session ID: sandctl-test1234") {
		t.Errorf("output should contain message, got: %q", output)
	}
	if !strings.HasSuffix(output, "\n") {
		t.Error("output should end with newline")
	}
}

// TestConfirm_GivenYes_ThenReturnsTrue tests 'y' confirmation.
func TestConfirm_GivenYes_ThenReturnsTrue(t *testing.T) {
	inputs := []string{"y", "Y", "yes", "Yes"}

	for _, input := range inputs {
		t.Run(input, func(t *testing.T) {
			reader := strings.NewReader(input + "\n")
			var buf bytes.Buffer

			result, err := Confirm(reader, &buf, "Continue?")

			if err != nil {
				t.Errorf("Confirm() error = %v", err)
			}
			if !result {
				t.Errorf("expected true for input %q", input)
			}
		})
	}
}

// TestConfirm_GivenNo_ThenReturnsFalse tests 'n' confirmation.
func TestConfirm_GivenNo_ThenReturnsFalse(t *testing.T) {
	inputs := []string{"n", "N", "no", "No", "", "anything"}

	for _, input := range inputs {
		t.Run(input, func(t *testing.T) {
			reader := strings.NewReader(input + "\n")
			var buf bytes.Buffer

			result, err := Confirm(reader, &buf, "Continue?")

			if err != nil {
				t.Errorf("Confirm() error = %v", err)
			}
			if result {
				t.Errorf("expected false for input %q", input)
			}
		})
	}
}

// TestConfirm_GivenPrompt_ThenWritesPrompt tests prompt output.
func TestConfirm_GivenPrompt_ThenWritesPrompt(t *testing.T) {
	reader := strings.NewReader("n\n")
	var buf bytes.Buffer

	_, _ = Confirm(reader, &buf, "Delete session?")

	output := buf.String()
	if !strings.Contains(output, "Delete session?") {
		t.Errorf("output should contain prompt, got: %q", output)
	}
	if !strings.Contains(output, "[y/N]") {
		t.Errorf("output should contain [y/N], got: %q", output)
	}
}

// TestConfirm_GivenEmptyInput_ThenReturnsFalse tests empty input as no.
func TestConfirm_GivenEmptyInput_ThenReturnsFalse(t *testing.T) {
	reader := strings.NewReader("\n")
	var buf bytes.Buffer

	result, err := Confirm(reader, &buf, "Continue?")

	// Empty input should be handled gracefully
	if err != nil {
		t.Errorf("Confirm() error = %v", err)
	}
	if result {
		t.Error("expected false for empty input")
	}
}

// TestProgressStep_GivenValues_ThenHasExpectedFields tests ProgressStep structure.
func TestProgressStep_GivenValues_ThenHasExpectedFields(t *testing.T) {
	called := false
	step := ProgressStep{
		Message: "Test step",
		Action: func() error {
			called = true
			return nil
		},
	}

	if step.Message != "Test step" {
		t.Errorf("Message = %q, want %q", step.Message, "Test step")
	}

	if err := step.Action(); err != nil {
		t.Errorf("Action() error = %v", err)
	}
	if !called {
		t.Error("Action should have been called")
	}
}
