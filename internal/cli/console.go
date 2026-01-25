package cli

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sprites"
	"github.com/sandctl/sandctl/internal/ui"
)

var consoleCmd = &cobra.Command{
	Use:   "console <name>",
	Short: "Open an interactive console to a running session",
	Long: `Open an SSH-like interactive terminal session to a running sandbox.

This command provides a direct terminal connection similar to SSH, with full
support for colors, terminal dimensions, and TUI applications.

For running single commands, use 'sandctl exec -c <command>' instead.`,
	Example: `  # Connect to a session (case-insensitive)
  sandctl console alice
  sandctl console Alice

  # For single commands, use exec instead:
  sandctl exec alice -c "ls -la"`,
	Args: cobra.ExactArgs(1),
	RunE: runConsole,
}

func init() {
	rootCmd.AddCommand(consoleCmd)
}

func runConsole(cmd *cobra.Command, args []string) error {
	// Check if stdin is a terminal (FR-011)
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		ui.PrintError(os.Stderr, "console requires an interactive terminal")
		fmt.Fprintln(os.Stderr)
		fmt.Fprintf(os.Stderr, "Use 'sandctl exec %s -c <command>' for non-interactive execution.\n", args[0])
		return nil
	}

	// Normalize the session name (case-insensitive)
	sessionName := session.NormalizeName(args[0])

	// Validate session name format
	if !session.ValidateID(sessionName) {
		return fmt.Errorf("invalid session name format: %s", args[0])
	}

	// Get Sprites client for validation
	client, err := getSpritesClient()
	if err != nil {
		return err
	}

	// Get session store for local lookups
	store := getSessionStore()

	// Check if session exists in local store first (FR-003)
	_, err = store.Get(sessionName)
	if err != nil {
		var notFound *session.NotFoundError
		if errors.As(err, &notFound) {
			ui.PrintError(os.Stderr, "session '%s' not found", sessionName)
			fmt.Fprintln(os.Stderr)
			fmt.Fprintln(os.Stderr, "Run 'sandctl list' to see available sessions.")
			return nil
		}
		return fmt.Errorf("failed to check session: %w", err)
	}

	// Verify sprite exists and is ready via API (FR-004)
	sprite, err := client.GetSprite(sessionName)
	if err != nil {
		return fmt.Errorf("failed to verify session: %w", err)
	}

	// Check if sprite is in a connectable state
	if sprite.State != "running" && sprite.State != "warm" {
		// Update local store with current status
		newStatus := mapSpriteStateToSession(sprite.State)
		_ = store.Update(sessionName, newStatus)
		ui.FormatSessionNotRunning(os.Stderr, sessionName, newStatus)
		return nil
	}

	// Update local store to running
	_ = store.Update(sessionName, session.StatusRunning)

	// Start interactive console session via sprite CLI
	return runSpriteConsole(sessionName)
}

// runSpriteConsole wraps the sprite CLI to provide a true TTY session.
// This gives us proper terminal handling including colors, dimensions, and TUI support.
// If the sprite CLI is not available, falls back to WebSocket-based connection.
func runSpriteConsole(sessionID string) error {
	// Check if sprite CLI is available
	spritePath, err := exec.LookPath("sprite")
	if err != nil {
		// Fall back to WebSocket-based connection
		fmt.Fprintln(os.Stderr, "Warning: sprite CLI not found. Using basic terminal mode.")
		fmt.Fprintln(os.Stderr, "For full color and TUI support, install the sprite CLI:")
		fmt.Fprintln(os.Stderr, "  curl -fsSL https://sprites.dev/install.sh | sh")
		fmt.Fprintln(os.Stderr)
		return runWebSocketConsole(sessionID)
	}

	verboseLog("Using sprite CLI at: %s", spritePath)

	// Run sprite console command
	// The sprite CLI handles all TTY setup, SSH connection, colors, and dimensions
	spriteCmd := exec.Command(spritePath, "console", "-s", sessionID)

	// Connect stdin/stdout/stderr directly for true TTY passthrough
	spriteCmd.Stdin = os.Stdin
	spriteCmd.Stdout = os.Stdout
	spriteCmd.Stderr = os.Stderr

	// Run the command (blocks until session ends)
	if err := spriteCmd.Run(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			// Exit code 1 often means auth failure or other setup issue
			// Fall back to WebSocket if it looks like an early failure
			if exitErr.ExitCode() == 1 {
				fmt.Fprintln(os.Stderr)
				fmt.Fprintln(os.Stderr, "sprite CLI failed (may need auth: sprite auth login)")
				fmt.Fprintln(os.Stderr, "Falling back to basic terminal mode...")
				fmt.Fprintln(os.Stderr)
				return runWebSocketConsole(sessionID)
			}
			// Other non-zero exits are normal (user exited, remote command failed)
			return nil
		}
		return fmt.Errorf("console session failed: %w", err)
	}

	return nil
}

// runWebSocketConsole provides a fallback console using the WebSocket API.
// This works without the sprite CLI but lacks proper TTY support (no colors, TUI issues).
func runWebSocketConsole(sessionID string) error {
	// Need to get the client again since we don't pass it
	client, err := getSpritesClient()
	if err != nil {
		return err
	}

	fmt.Printf("Connecting to %s...\n", sessionID)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle interrupt signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		cancel()
	}()

	// Set terminal to raw mode for interactive session
	oldState, err := term.MakeRaw(int(os.Stdin.Fd()))
	if err != nil {
		verboseLog("Warning: failed to set raw mode: %v", err)
	} else {
		defer func() {
			_ = term.Restore(int(os.Stdin.Fd()), oldState)
			fmt.Println()
		}()
	}

	fmt.Println("Connected. Press Ctrl+D to exit.")

	// Open WebSocket exec session
	execSession, err := client.ExecWebSocket(ctx, sessionID, sprites.ExecOptions{
		Interactive: true,
		Stdin:       os.Stdin,
		Stdout:      os.Stdout,
		Stderr:      os.Stderr,
	})
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	if err := execSession.Run(); err != nil {
		return fmt.Errorf("session error: %w", err)
	}

	return nil
}
