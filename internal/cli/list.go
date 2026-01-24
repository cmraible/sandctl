package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/session"
)

var (
	listFormat string
	listAll    bool
)

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List active sessions",
	Long: `Display all active sandctl sessions.

By default, only shows sessions in provisioning or running state.
Use --all to include stopped and failed sessions.`,
	Example: `  # List active sessions
  sandctl list

  # List all sessions including stopped
  sandctl list --all

  # Output as JSON
  sandctl list --format json`,
	Aliases: []string{"ls"},
	RunE:    runList,
}

func init() {
	listCmd.Flags().StringVarP(&listFormat, "format", "f", "table", "output format: table, json")
	listCmd.Flags().BoolVarP(&listAll, "all", "a", false, "include stopped/failed sessions")

	rootCmd.AddCommand(listCmd)
}

func runList(cmd *cobra.Command, args []string) error {
	store := getSessionStore()

	// Get sessions from local store
	var sessions []session.Session
	var err error

	if listAll {
		sessions, err = store.List()
	} else {
		sessions, err = store.ListActive()
	}

	if err != nil {
		return fmt.Errorf("failed to list sessions: %w", err)
	}

	// Sync with Sprites API if we have config
	cfg, cfgErr := loadConfig()
	if cfgErr == nil {
		sessions = syncWithSpritesAPI(sessions, cfg.SpritesToken, store)
	}

	// Handle empty state
	if len(sessions) == 0 {
		fmt.Println("No active sessions.")
		fmt.Println()
		fmt.Println("Use 'sandctl start --prompt \"your task\"' to create one.")
		return nil
	}

	// Output in requested format
	switch listFormat {
	case "json":
		return outputJSON(sessions)
	case "table":
		return outputTable(sessions)
	default:
		return fmt.Errorf("unknown format: %s (valid: table, json)", listFormat)
	}
}

// syncWithSpritesAPI updates local session statuses from the Sprites API.
func syncWithSpritesAPI(sessions []session.Session, _ string, store *session.Store) []session.Session {
	client, err := getSpritesClient()
	if err != nil {
		verboseLog("Failed to create Sprites client for sync: %v", err)
		return sessions
	}

	sprites, err := client.ListSprites()
	if err != nil {
		verboseLog("Failed to sync with Sprites API: %v", err)
		return sessions
	}

	// Build a map of sprite states
	spriteStates := make(map[string]string)
	for _, sprite := range sprites {
		spriteStates[sprite.Name] = sprite.State
	}

	// Update session statuses
	for i, sess := range sessions {
		if state, exists := spriteStates[sess.ID]; exists {
			newStatus := mapSpriteState(state)
			if newStatus != sess.Status {
				sessions[i].Status = newStatus
				_ = store.Update(sess.ID, newStatus)
			}
		} else if sess.Status.IsActive() {
			// Sprite doesn't exist but session thinks it's active
			sessions[i].Status = session.StatusStopped
			_ = store.Update(sess.ID, session.StatusStopped)
		}
	}

	return sessions
}

// mapSpriteState converts Sprites API state to session status.
func mapSpriteState(state string) session.Status {
	switch state {
	case "running":
		return session.StatusRunning
	case "stopped", "destroyed":
		return session.StatusStopped
	case "failed":
		return session.StatusFailed
	default:
		return session.StatusProvisioning
	}
}

// outputJSON outputs sessions as JSON.
func outputJSON(sessions []session.Session) error {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(sessions)
}

// outputTable outputs sessions as a formatted table.
func outputTable(sessions []session.Session) error {
	// Print header
	fmt.Printf("%-18s %-12s %-20s %s\n",
		"ID", "STATUS", "CREATED", "TIMEOUT")

	// Print sessions
	for _, sess := range sessions {
		timeout := formatTimeout(sess.TimeoutRemaining())
		created := formatCreatedTime(sess.CreatedAt)

		fmt.Printf("%-18s %-12s %-20s %s\n",
			sess.ID,
			sess.Status,
			created,
			timeout,
		)
	}

	return nil
}

// formatTimeout formats the remaining timeout duration.
func formatTimeout(remaining *time.Duration) string {
	if remaining == nil {
		return "-"
	}

	d := *remaining
	if d <= 0 {
		return "expired"
	}

	if d >= time.Hour {
		return fmt.Sprintf("%dh remaining", int(d.Hours()))
	}
	return fmt.Sprintf("%dm remaining", int(d.Minutes()))
}

// formatCreatedTime formats the creation time for display.
func formatCreatedTime(t time.Time) string {
	return t.Local().Format("2006-01-02 15:04:05")
}
