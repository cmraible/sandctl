package cli

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/provider"
	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/ui"
)

var (
	resizeForce      bool
	resizeUpgradeDisk bool
)

var resizeCmd = &cobra.Command{
	Use:   "resize <name> <server-type>",
	Short: "Resize a session's server type (CPU/RAM)",
	Long: `Resize a sandboxed VM by changing its Hetzner server type.

The server will be stopped, resized, and restarted automatically.

By default, the disk size is not changed (allowing future downgrades).
Use --upgrade-disk to expand the disk to match the new server type
(prevents future downgrades).`,
	Example: `  # Resize to a larger server type
  sandctl resize alice cpx41

  # Resize with disk upgrade (prevents future downgrades)
  sandctl resize alice cpx41 --upgrade-disk

  # Resize without confirmation
  sandctl resize alice cpx41 --force`,
	Args: cobra.ExactArgs(2),
	RunE: runResize,
}

func init() {
	resizeCmd.Flags().BoolVarP(&resizeForce, "force", "f", false, "skip confirmation prompt")
	resizeCmd.Flags().BoolVar(&resizeUpgradeDisk, "upgrade-disk", false, "expand disk to match new server type (prevents downgrades)")

	rootCmd.AddCommand(resizeCmd)
}

func runResize(cmd *cobra.Command, args []string) error {
	ctx := context.Background()

	sessionName := session.NormalizeName(args[0])
	serverType := args[1]

	// Validate session name format
	if !session.ValidateID(sessionName) {
		return fmt.Errorf("invalid session name format: %s", args[0])
	}

	// Get session from store
	store := getSessionStore()
	sess, err := store.Get(sessionName)
	if err != nil {
		var notFound *session.NotFoundError
		if errors.As(err, &notFound) {
			ui.PrintError(os.Stderr, "session '%s' not found", sessionName)
			fmt.Fprintln(os.Stderr)
			fmt.Fprintln(os.Stderr, "Use 'sandctl list' to see active sessions.")
			return nil
		}
		return err
	}

	// Check for legacy sessions
	if sess.IsLegacySession() {
		ui.PrintError(os.Stderr, "session '%s' is from an old version and cannot be resized", sessionName)
		return nil
	}

	// Get provider
	prov, err := getProviderFromSession(sess)
	if err != nil {
		return fmt.Errorf("failed to get provider: %w", err)
	}

	// Check provider supports resize
	resizer, ok := prov.(provider.Resizer)
	if !ok {
		return fmt.Errorf("provider '%s' does not support resize", sess.Provider)
	}

	// Confirm unless --force
	if !resizeForce {
		msg := fmt.Sprintf("Resize session '%s' to %s?", sessionName, serverType)
		if resizeUpgradeDisk {
			ui.PrintWarning(os.Stdout, "--upgrade-disk will expand the disk to match %s. This prevents future downgrades.", serverType)
			msg = fmt.Sprintf("Resize session '%s' to %s (with disk upgrade)?", sessionName, serverType)
		}
		confirmed, confirmErr := ui.Confirm(os.Stdin, os.Stdout, msg)
		if confirmErr != nil {
			return fmt.Errorf("failed to read confirmation: %w", confirmErr)
		}
		if !confirmed {
			fmt.Println("Canceled.")
			return nil
		}
	}

	// Run resize with progress steps
	err = ui.RunSteps(os.Stdout, []ui.ProgressStep{
		{
			Message: "Resizing session",
			Action: func() error {
				return resizer.Resize(ctx, sess.ProviderID, serverType, resizeUpgradeDisk)
			},
		},
	})
	if err != nil {
		return fmt.Errorf("resize failed: %w", err)
	}

	fmt.Printf("Session '%s' resized to %s.\n", sessionName, serverType)

	return nil
}
