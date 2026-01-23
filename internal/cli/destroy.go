package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sprites"
	"github.com/sandctl/sandctl/internal/ui"
)

var destroyForce bool

var destroyCmd = &cobra.Command{
	Use:   "destroy <session-id>",
	Short: "Terminate and remove a session",
	Long: `Terminate and remove a sandboxed VM.

By default, prompts for confirmation before destroying. Use --force
to skip the confirmation prompt.`,
	Example: `  # Destroy with confirmation
  sandctl destroy sandctl-a1b2c3d4

  # Destroy without confirmation
  sandctl destroy sandctl-a1b2c3d4 --force`,
	Aliases: []string{"rm", "delete"},
	Args:    cobra.ExactArgs(1),
	RunE:    runDestroy,
}

func init() {
	destroyCmd.Flags().BoolVarP(&destroyForce, "force", "f", false, "skip confirmation prompt")

	rootCmd.AddCommand(destroyCmd)
}

func runDestroy(cmd *cobra.Command, args []string) error {
	sessionID := args[0]

	// Validate session ID format
	if !session.ValidateID(sessionID) {
		return fmt.Errorf("invalid session ID format: %s", sessionID)
	}

	// Get session from store
	store := getSessionStore()
	_, err := store.Get(sessionID)
	if err != nil {
		// Check if it's a not found error
		if _, ok := err.(*session.SessionNotFoundError); ok {
			ui.PrintError(os.Stderr, "session '%s' not found", sessionID)
			fmt.Fprintln(os.Stderr)
			fmt.Fprintln(os.Stderr, "Use 'sandctl list' to see active sessions.")
			return nil
		}
		return err
	}

	// Confirm unless --force
	if !destroyForce {
		confirmed, err := ui.Confirm(os.Stdin, os.Stdout,
			fmt.Sprintf("Destroy session %s? This cannot be undone.", sessionID))
		if err != nil {
			return fmt.Errorf("failed to read confirmation: %w", err)
		}
		if !confirmed {
			fmt.Println("Cancelled.")
			return nil
		}
	}

	// Get Sprites client
	client, err := getSpritesClient()
	if err != nil {
		return err
	}

	// Show progress
	spin := ui.NewSpinner(os.Stdout)
	spin.Start("Destroying session")

	// Delete sprite from Fly.io
	if err := client.DeleteSprite(sessionID); err != nil {
		// If not found on Fly.io, still remove from local store
		if apiErr, ok := err.(*sprites.APIError); ok && apiErr.IsNotFound() {
			verboseLog("Sprite not found on Fly.io, removing from local store only")
		} else {
			spin.Fail("Destroying session")
			return fmt.Errorf("failed to destroy session: %w", err)
		}
	}

	// Remove from local store
	if err := store.Remove(sessionID); err != nil {
		verboseLog("Warning: failed to remove session from local store: %v", err)
	}

	spin.Success(fmt.Sprintf("Session %s destroyed.", sessionID))

	return nil
}
