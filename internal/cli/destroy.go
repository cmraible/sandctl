package cli

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/ui"
)

var destroyForce bool

var destroyCmd = &cobra.Command{
	Use:   "destroy <name>",
	Short: "Terminate and remove a session",
	Long: `Terminate and remove a sandboxed VM.

By default, prompts for confirmation before destroying. Use --force
to skip the confirmation prompt.`,
	Example: `  # Destroy with confirmation
  sandctl destroy alice

  # Destroy without confirmation (case-insensitive)
  sandctl destroy Alice --force`,
	Aliases: []string{"rm", "delete"},
	Args:    cobra.ExactArgs(1),
	RunE:    runDestroy,
}

func init() {
	destroyCmd.Flags().BoolVarP(&destroyForce, "force", "f", false, "skip confirmation prompt")

	rootCmd.AddCommand(destroyCmd)
}

func runDestroy(cmd *cobra.Command, args []string) error {
	ctx := context.Background()

	// Normalize the session name (case-insensitive)
	sessionName := session.NormalizeName(args[0])

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

	// Check if session has provider info (new format)
	if sess.IsLegacySession() {
		ui.PrintError(os.Stderr, "session '%s' is from an old version", sessionName)
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "This session cannot be destroyed automatically.")
		fmt.Fprintln(os.Stderr, "Please check your old provider console to manually remove any orphaned VMs.")

		// Still remove from local store
		if destroyForce {
			_ = store.Remove(sessionName)
			fmt.Printf("Removed '%s' from local session store.\n", sessionName)
		} else {
			fmt.Fprintln(os.Stderr, "Use --force to remove from local store only.")
		}
		return nil
	}

	// Confirm unless --force
	if !destroyForce {
		confirmed, confirmErr := ui.Confirm(os.Stdin, os.Stdout,
			fmt.Sprintf("Destroy session '%s'? This cannot be undone.", sessionName))
		if confirmErr != nil {
			return fmt.Errorf("failed to read confirmation: %w", confirmErr)
		}
		if !confirmed {
			fmt.Println("Canceled.")
			return nil
		}
	}

	// Get provider for this session
	prov, err := getProviderFromSession(sess)
	if err != nil {
		// If provider lookup fails but we have provider_id, still try to remove from store
		verboseLog("Warning: could not get provider: %v", err)
	}

	// Show progress
	spin := ui.NewSpinner(os.Stdout)
	spin.Start("Destroying session")

	// Delete VM from provider
	if prov != nil && sess.ProviderID != "" {
		if err := prov.Delete(ctx, sess.ProviderID); err != nil {
			// Log the error but continue with local cleanup
			verboseLog("Warning: failed to delete VM from provider: %v", err)
		}
	}

	// Remove from local store
	if err := store.Remove(sessionName); err != nil {
		verboseLog("Warning: failed to remove session from local store: %v", err)
	}

	spin.Success(fmt.Sprintf("Session '%s' destroyed.", sessionName))

	return nil
}
