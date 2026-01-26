package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/provider"
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
Use --all to include stopped and failed sessions.

This command syncs with the provider API to show current VM status.`,
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
	ctx := context.Background()
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

	// Sync with provider API
	sessions = syncWithProviderAPI(ctx, sessions, store)

	// Handle empty state
	if len(sessions) == 0 {
		fmt.Println("No active sessions.")
		fmt.Println()
		fmt.Println("Use 'sandctl new' to create one.")
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

// syncWithProviderAPI updates local session statuses from provider APIs.
func syncWithProviderAPI(ctx context.Context, sessions []session.Session, store *session.Store) []session.Session {
	// Group sessions by provider
	byProvider := make(map[string][]int) // provider name -> session indices
	for i, sess := range sessions {
		if sess.Provider != "" {
			byProvider[sess.Provider] = append(byProvider[sess.Provider], i)
		}
	}

	// Sync each provider
	for provName, indices := range byProvider {
		prov, err := getProvider(provName)
		if err != nil {
			verboseLog("Failed to get provider %s for sync: %v", provName, err)
			continue
		}

		vms, err := prov.List(ctx)
		if err != nil {
			verboseLog("Failed to list VMs from %s: %v", provName, err)
			continue
		}

		// Build a map of VM states by ID
		vmStates := make(map[string]*provider.VM)
		for _, vm := range vms {
			vmStates[vm.ID] = vm
		}

		// Update session statuses
		for _, i := range indices {
			sess := &sessions[i]
			if sess.ProviderID == "" {
				continue
			}

			if vm, exists := vmStates[sess.ProviderID]; exists {
				newStatus := mapVMStatusToSession(vm.Status)
				if newStatus != sess.Status {
					sessions[i].Status = newStatus
					_ = store.Update(sess.ID, newStatus)
				}
				// Update IP address if it changed
				if vm.IPAddress != "" && vm.IPAddress != sess.IPAddress {
					sessions[i].IPAddress = vm.IPAddress
					_ = store.UpdateSession(sessions[i])
				}
			} else if sess.Status.IsActive() {
				// VM doesn't exist but session thinks it's active
				sessions[i].Status = session.StatusStopped
				_ = store.Update(sess.ID, session.StatusStopped)
			}
		}
	}

	// Handle legacy sessions (warn about them)
	for i, sess := range sessions {
		if sess.IsLegacySession() && sess.Status.IsActive() {
			// Mark legacy sessions as stopped since we can't verify them
			sessions[i].Status = session.StatusStopped
			_ = store.Update(sess.ID, session.StatusStopped)
			verboseLog("Legacy session '%s' marked as stopped", sess.ID)
		}
	}

	return sessions
}

// mapVMStatusToSession converts provider.VMStatus to session.Status.
func mapVMStatusToSession(status provider.VMStatus) session.Status {
	switch status {
	case provider.StatusRunning:
		return session.StatusRunning
	case provider.StatusProvisioning, provider.StatusStarting:
		return session.StatusProvisioning
	case provider.StatusStopped, provider.StatusStopping, provider.StatusDeleting:
		return session.StatusStopped
	case provider.StatusFailed:
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
	fmt.Printf("%-18s %-10s %-16s %-20s %s\n",
		"ID", "PROVIDER", "STATUS", "CREATED", "TIMEOUT")

	// Print sessions
	for _, sess := range sessions {
		timeout := formatTimeout(sess.TimeoutRemaining())
		created := formatCreatedTime(sess.CreatedAt)
		providerName := sess.Provider
		if providerName == "" {
			providerName = "(legacy)"
		}

		fmt.Printf("%-18s %-10s %-16s %-20s %s\n",
			sess.ID,
			providerName,
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
