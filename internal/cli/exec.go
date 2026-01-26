package cli

import (
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sshexec"
	"github.com/sandctl/sandctl/internal/ui"
)

var execCommand string

var execCmd = &cobra.Command{
	Use:   "exec <name>",
	Short: "Execute a command in a running session",
	Long: `Execute a command in a running VM via SSH.

Use --command to run a single command and return the output.
Without --command, opens an interactive shell session.`,
	Example: `  # Run a single command
  sandctl exec alice -c "ls -la"

  # Check docker status
  sandctl exec alice -c "docker ps"

  # Interactive shell (case-insensitive)
  sandctl exec alice
  sandctl exec Alice`,
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

	// Get SSH private key path
	privateKeyPath, err := getSSHPrivateKeyPath()
	if err != nil {
		return err
	}

	// Create SSH client
	client, err := sshexec.NewClient(sess.IPAddress, privateKeyPath)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	defer client.Close()

	// Single command mode
	if execCommand != "" {
		verboseLog("Executing command: %s", execCommand)

		output, err := client.Exec(execCommand)
		if err != nil {
			return fmt.Errorf("command execution failed: %w", err)
		}

		fmt.Print(output)
		return nil
	}

	// Interactive mode
	fmt.Printf("Connecting to %s (%s)...\n", sessionName, sess.IPAddress)
	return client.Console(sshexec.ConsoleOptions{})
}
