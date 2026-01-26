package sshexec

import (
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"golang.org/x/crypto/ssh"
	"golang.org/x/term"
)

// ConsoleOptions configures interactive console behavior.
type ConsoleOptions struct {
	// Stdin is the input stream (default: os.Stdin).
	Stdin io.Reader
	// Stdout is the output stream (default: os.Stdout).
	Stdout io.Writer
	// Stderr is the error stream (default: os.Stderr).
	Stderr io.Writer
	// Shell is the shell to run (default: bash).
	Shell string
}

// Console opens an interactive terminal session.
func (c *Client) Console(opts ConsoleOptions) error {
	session, err := c.getSession()
	if err != nil {
		return err
	}
	defer session.Close()

	// Set defaults
	if opts.Stdin == nil {
		opts.Stdin = os.Stdin
	}
	if opts.Stdout == nil {
		opts.Stdout = os.Stdout
	}
	if opts.Stderr == nil {
		opts.Stderr = os.Stderr
	}
	if opts.Shell == "" {
		opts.Shell = "bash"
	}

	// Set up I/O
	session.Stdin = opts.Stdin
	session.Stdout = opts.Stdout
	session.Stderr = opts.Stderr

	// Get terminal dimensions
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return fmt.Errorf("stdin is not a terminal")
	}

	width, height, err := term.GetSize(fd)
	if err != nil {
		// Use reasonable defaults if we can't get size
		width, height = 80, 24
	}

	// Request pseudo-terminal
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,     // Enable echo
		ssh.TTY_OP_ISPEED: 14400, // Input speed
		ssh.TTY_OP_OSPEED: 14400, // Output speed
	}

	termType := os.Getenv("TERM")
	if termType == "" {
		termType = "xterm-256color"
	}

	if ptyErr := session.RequestPty(termType, height, width, modes); ptyErr != nil {
		return fmt.Errorf("failed to request PTY: %w", ptyErr)
	}

	// Set terminal to raw mode
	oldState, rawErr := term.MakeRaw(fd)
	if rawErr != nil {
		return fmt.Errorf("failed to set raw mode: %w", rawErr)
	}
	defer func() {
		_ = term.Restore(fd, oldState)
	}()

	// Handle window resize
	sigwinch := make(chan os.Signal, 1)
	signal.Notify(sigwinch, syscall.SIGWINCH)
	go func() {
		for range sigwinch {
			w, h, err := term.GetSize(fd)
			if err == nil {
				_ = session.WindowChange(h, w)
			}
		}
	}()
	defer signal.Stop(sigwinch)

	// Start shell
	if err := session.Shell(); err != nil {
		return fmt.Errorf("failed to start shell: %w", err)
	}

	// Wait for session to complete
	return session.Wait()
}
