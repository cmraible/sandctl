package cli

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/repoconfig"
	"github.com/sandctl/sandctl/internal/ui"
)

var repoRemoveForce bool

var repoRemoveCmd = &cobra.Command{
	Use:     "remove <repository>",
	Short:   "Delete a repository configuration",
	Aliases: []string{"rm", "delete"},
	Long: `Delete a repository configuration and its init script.

By default, prompts for confirmation before deleting. Use --force to skip.
The repository can be specified as owner/repo or the normalized name.`,
	Example: `  # Remove with confirmation
  sandctl repo remove TryGhost/Ghost

  # Remove without confirmation
  sandctl repo remove TryGhost/Ghost --force

  # Using normalized name
  sandctl repo remove tryghost-ghost -f`,
	Args: cobra.ExactArgs(1),
	RunE: runRepoRemove,
}

func init() {
	repoRemoveCmd.Flags().BoolVarP(&repoRemoveForce, "force", "f", false, "skip confirmation prompt")

	repoCmd.AddCommand(repoRemoveCmd)
}

func runRepoRemove(cmd *cobra.Command, args []string) error {
	repoName := args[0]
	store := getRepoStore()

	// Check if config exists
	config, err := store.Get(repoName)
	if err != nil {
		var notFound *repoconfig.NotFoundError
		if _, ok := err.(*repoconfig.NotFoundError); ok {
			notFound = err.(*repoconfig.NotFoundError)
			fmt.Fprintf(os.Stderr, "Error: %s\n", notFound.Error())
			return nil
		}
		return err
	}

	// Confirm deletion unless --force
	if !repoRemoveForce {
		if !ui.IsTerminal() {
			return fmt.Errorf("--force flag is required in non-interactive mode")
		}

		confirmed, err := confirmRemoval(config.OriginalName)
		if err != nil {
			return err
		}
		if !confirmed {
			fmt.Println("Cancelled")
			return nil
		}
	}

	// Remove the configuration
	if err := store.Remove(repoName); err != nil {
		return fmt.Errorf("failed to remove configuration: %w", err)
	}

	fmt.Printf("Removed configuration for %s\n", config.OriginalName)
	return nil
}

// confirmRemoval prompts for confirmation to remove a repo configuration.
func confirmRemoval(repoName string) (bool, error) {
	fmt.Printf("Remove configuration for '%s'? [y/N]: ", repoName)

	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		return false, err
	}

	input = strings.TrimSpace(strings.ToLower(input))
	return input == "y" || input == "yes", nil
}
