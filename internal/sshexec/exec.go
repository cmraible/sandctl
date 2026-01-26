package sshexec

import (
	"bytes"
	"fmt"
	"io"
)

// ExecResult contains the output from an executed command.
type ExecResult struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

// Exec runs a command and returns the combined output.
func (c *Client) Exec(command string) (string, error) {
	session, err := c.getSession()
	if err != nil {
		return "", err
	}
	defer session.Close()

	var stdout, stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr

	if err := session.Run(command); err != nil {
		// Include stderr in error message for debugging
		if stderr.Len() > 0 {
			return stdout.String(), fmt.Errorf("command failed: %w\nstderr: %s", err, stderr.String())
		}
		return stdout.String(), fmt.Errorf("command failed: %w", err)
	}

	return stdout.String(), nil
}

// ExecWithResult runs a command and returns detailed results.
func (c *Client) ExecWithResult(command string) (*ExecResult, error) {
	session, err := c.getSession()
	if err != nil {
		return nil, err
	}
	defer session.Close()

	var stdout, stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr

	exitCode := 0
	if err := session.Run(command); err != nil {
		// Try to get exit code from error
		if exitErr, ok := err.(*ExitError); ok {
			exitCode = exitErr.ExitCode
		} else {
			return nil, fmt.Errorf("command failed: %w", err)
		}
	}

	return &ExecResult{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		ExitCode: exitCode,
	}, nil
}

// ExecWithStreams runs a command with custom I/O streams.
func (c *Client) ExecWithStreams(command string, stdin io.Reader, stdout, stderr io.Writer) error {
	session, err := c.getSession()
	if err != nil {
		return err
	}
	defer session.Close()

	session.Stdin = stdin
	session.Stdout = stdout
	session.Stderr = stderr

	return session.Run(command)
}

// ExitError represents a command that exited with a non-zero status.
type ExitError struct {
	ExitCode int
	Message  string
}

func (e *ExitError) Error() string {
	return fmt.Sprintf("exit status %d: %s", e.ExitCode, e.Message)
}
