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
	// Normalize the session name (case-insensitive)
	sessionName := session.NormalizeName(args[0])

	// Validate session name format
	if !session.ValidateID(sessionName) {
		return fmt.Errorf("invalid session name format: %s", args[0])
	}

	// Get session from store
	store := getSessionStore()
	_, err := store.Get(sessionName)
	if err != nil {
		// Check if it's a not found error
		if _, ok := err.(*session.NotFoundError); ok {
			ui.PrintError(os.Stderr, "session '%s' not found", sessionName)
			fmt.Fprintln(os.Stderr)
			fmt.Fprintln(os.Stderr, "Use 'sandctl list' to see active sessions.")
			return nil
		}
		return err
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

	// Get Sprites client
	client, err := getSpritesClient()
	if err != nil {
		return err
	}

	// Show progress
	spin := ui.NewSpinner(os.Stdout)
	spin.Start("Destroying session")

	// Delete sprite from Fly.io
	if err := client.DeleteSprite(sessionName); err != nil {
		// If not found on Fly.io, still remove from local store
		if apiErr, ok := err.(*sprites.APIError); ok && apiErr.IsNotFound() {
			verboseLog("Sprite not found on Fly.io, removing from local store only")
		} else {
			// API might return error but still delete - verify it's actually gone
			_, verifyErr := client.GetSprite(sessionName)
			if verifyErr == nil {
				// Sprite still exists, deletion actually failed
				spin.Fail("Destroying session")
				return fmt.Errorf("failed to destroy session: %w", err)
			}
			// Sprite is gone, treat as success despite the error
			verboseLog("API returned error but sprite was deleted: %v", err)
		}
	}

	// Remove from local store
	if err := store.Remove(sessionName); err != nil {
		verboseLog("Warning: failed to remove session from local store: %v", err)
	}

	spin.Success(fmt.Sprintf("Session '%s' destroyed.", sessionName))

	return nil
}
