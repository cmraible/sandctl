// Package ui provides terminal UI helpers for sandctl.
package ui

import (
	"fmt"
	"io"
	"os"
	"time"

	"github.com/briandowns/spinner"
)

// Spinner wraps a terminal spinner for progress indication.
type Spinner struct {
	spinner *spinner.Spinner
	writer  io.Writer
}

// NewSpinner creates a new progress spinner.
func NewSpinner(writer io.Writer) *Spinner {
	if writer == nil {
		writer = os.Stdout
	}
	s := spinner.New(spinner.CharSets[14], 100*time.Millisecond, spinner.WithWriter(writer))
	return &Spinner{
		spinner: s,
		writer:  writer,
	}
}

// Start begins the spinner with the given message.
func (s *Spinner) Start(message string) {
	s.spinner.Suffix = " " + message
	s.spinner.Start()
}

// Update changes the spinner message.
func (s *Spinner) Update(message string) {
	s.spinner.Suffix = " " + message
}

// Success stops the spinner and shows a success message.
func (s *Spinner) Success(message string) {
	s.spinner.Stop()
	fmt.Fprintf(s.writer, "✓ %s\n", message)
}

// Fail stops the spinner and shows a failure message.
func (s *Spinner) Fail(message string) {
	s.spinner.Stop()
	fmt.Fprintf(s.writer, "✗ %s\n", message)
}

// Stop stops the spinner without a message.
func (s *Spinner) Stop() {
	s.spinner.Stop()
}

// ProgressStep represents a step in a multi-step operation.
type ProgressStep struct {
	Message string
	Action  func() error
}

// RunSteps executes a series of steps with progress indication.
func RunSteps(writer io.Writer, steps []ProgressStep) error {
	spin := NewSpinner(writer)

	for _, step := range steps {
		spin.Start(step.Message + "...")
		if err := step.Action(); err != nil {
			spin.Fail(step.Message)
			return err
		}
		spin.Success(step.Message)
	}

	return nil
}

// PrintSuccess prints a success message.
func PrintSuccess(writer io.Writer, format string, args ...interface{}) {
	fmt.Fprintf(writer, "✓ "+format+"\n", args...)
}

// PrintError prints an error message.
func PrintError(writer io.Writer, format string, args ...interface{}) {
	fmt.Fprintf(writer, "Error: "+format+"\n", args...)
}

// PrintWarning prints a warning message.
func PrintWarning(writer io.Writer, format string, args ...interface{}) {
	fmt.Fprintf(writer, "Warning: "+format+"\n", args...)
}

// PrintInfo prints an info message.
func PrintInfo(writer io.Writer, format string, args ...interface{}) {
	fmt.Fprintf(writer, format+"\n", args...)
}

// Confirm prompts the user for confirmation.
func Confirm(reader io.Reader, writer io.Writer, message string) (bool, error) {
	fmt.Fprintf(writer, "%s [y/N]: ", message)

	var response string
	_, err := fmt.Fscanln(reader, &response)
	if err != nil && err.Error() != "unexpected newline" {
		return false, err
	}

	return response == "y" || response == "Y" || response == "yes" || response == "Yes", nil
}
