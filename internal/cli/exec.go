package cli

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sprites"
	"github.com/sandctl/sandctl/internal/ui"
)

var execCommand string

var execCmd = &cobra.Command{
	Use:   "exec <name>",
	Short: "Connect to a running session",
	Long: `Open an interactive shell session inside a running VM.

By default, opens an interactive shell. Use --command to run a single
command and return the output.`,
	Example: `  # Interactive shell (case-insensitive)
  sandctl exec alice
  sandctl exec Alice

  # Run a single command
  sandctl exec alice -c "ls -la"

  # Check agent logs
  sandctl exec alice -c "cat /var/log/agent.log"`,
	Args: cobra.ExactArgs(1),
	RunE: runExec,
}

func init() {
	execCmd.Flags().StringVarP(&execCommand, "command", "c", "", "run a single command instead of interactive shell")

	rootCmd.AddCommand(execCmd)
}

func runExec(cmd *cobra.Command, args []string) error {
	// Normalize the session name (case-insensitive)
	sessionName := session.NormalizeName(args[0])

	// Validate session name format
	if !session.ValidateID(sessionName) {
		return fmt.Errorf("invalid session name format: %s", args[0])
	}

	// Get Sprites client
	client, err := getSpritesClient()
	if err != nil {
		return err
	}

	// Verify sprite exists and is ready (running or warm)
	sprite, err := client.GetSprite(sessionName)
	if err != nil {
		return fmt.Errorf("failed to verify session: %w", err)
	}

	store := getSessionStore()

	// "warm" = hibernated but ready, "running" = active
	if sprite.State != "running" && sprite.State != "warm" {
		// Update local store with current status
		newStatus := mapSpriteStateToSession(sprite.State)
		_ = store.Update(sessionName, newStatus)
		ui.FormatSessionNotRunning(os.Stderr, sessionName, newStatus)
		return nil
	}

	// Update local store to running
	_ = store.Update(sessionName, session.StatusRunning)

	// Single command mode
	if execCommand != "" {
		return runSingleCommand(client, sessionName, execCommand)
	}

	// Interactive mode
	return runInteractiveSession(client, sessionName)
}

// runSingleCommand executes a single command and prints the output.
func runSingleCommand(client *sprites.Client, sessionID, command string) error {
	verboseLog("Executing command: %s", command)

	output, err := client.ExecCommand(sessionID, command)
	if err != nil {
		return fmt.Errorf("command execution failed: %w", err)
	}

	fmt.Print(output)
	return nil
}

// runInteractiveSession opens an interactive shell session.
func runInteractiveSession(client *sprites.Client, sessionID string) error {
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
		// Continue anyway, might work in some terminals
	} else {
		defer func() {
			_ = term.Restore(int(os.Stdin.Fd()), oldState)
			fmt.Println() // New line after session ends
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

	// Run the session
	if err := execSession.Run(); err != nil {
		return fmt.Errorf("session error: %w", err)
	}

	return nil
}

// mapSpriteStateToSession converts Sprites API state to session status.
func mapSpriteStateToSession(state string) session.Status {
	switch state {
	case "running", "warm":
		return session.StatusRunning
	case "stopped", "destroyed":
		return session.StatusStopped
	case "failed":
		return session.StatusFailed
	default:
		return session.StatusProvisioning
	}
}
