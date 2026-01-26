package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/repoconfig"
)

var repoShowCmd = &cobra.Command{
	Use:   "show <repository>",
	Short: "Display the init script for a repository",
	Long: `Display the contents of a repository's init script.

The repository can be specified as owner/repo or the normalized name.`,
	Example: `  # Show init script by original name
  sandctl repo show TryGhost/Ghost

  # Show init script by normalized name
  sandctl repo show tryghost-ghost`,
	Args: cobra.ExactArgs(1),
	RunE: runRepoShow,
}

func init() {
	repoCmd.AddCommand(repoShowCmd)
}

func runRepoShow(cmd *cobra.Command, args []string) error {
	repoName := args[0]
	store := getRepoStore()

	// Get config to display original name
	config, err := store.Get(repoName)
	if err != nil {
		if notFound, ok := err.(*repoconfig.NotFoundError); ok {
			fmt.Fprintf(os.Stderr, "Error: %s\n", notFound.Error())
			fmt.Fprintln(os.Stderr, "Use 'sandctl repo add' to create one")
			return nil
		}
		return err
	}

	// Get script content
	scriptContent, err := store.GetInitScript(repoName)
	if err != nil {
		return fmt.Errorf("failed to read init script: %w", err)
	}

	// Display header
	scriptPath := store.GetInitScriptPath(repoName)
	fmt.Printf("# Init script for %s\n", config.OriginalName)
	fmt.Printf("# Path: %s\n", scriptPath)
	fmt.Println()

	// Display content
	fmt.Print(scriptContent)

	return nil
}
