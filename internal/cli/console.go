package cli

import (
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sshexec"
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
	// Check if stdin is a terminal
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

	// Get session store
	store := getSessionStore()

	// Check if session exists in local store
	sess, err := store.Get(sessionName)
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

	// Check if session has provider info (new format)
	if sess.IsLegacySession() {
		ui.PrintError(os.Stderr, "session '%s' is from an old version and incompatible", sessionName)
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "Please destroy this session and create a new one.")
		return nil
	}

	// Check if session is running
	if sess.Status != session.StatusRunning {
		ui.FormatSessionNotRunning(os.Stderr, sessionName, sess.Status)
		return nil
	}

	// Check if we have IP address
	if sess.IPAddress == "" {
		return fmt.Errorf("session '%s' has no IP address", sessionName)
	}

	fmt.Printf("Connecting to %s (%s)...\n", sessionName, sess.IPAddress)

	// Create SSH client and open console
	client, err := createSSHClient(sess.IPAddress)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	defer client.Close()

	return client.Console(sshexec.ConsoleOptions{})
}
