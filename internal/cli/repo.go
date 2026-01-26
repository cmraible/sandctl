package cli

import (
	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/repoconfig"
)

var (
	repoStore *repoconfig.Store
)

// repoCmd represents the repo parent command.
var repoCmd = &cobra.Command{
	Use:   "repo",
	Short: "Manage repository initialization configurations",
	Long: `Manage per-repository initialization scripts for sandctl sessions.

Repository configurations allow you to define initialization scripts that run
automatically when creating a session with the -R flag. This is useful for
setting up development environments, installing dependencies, and configuring
project-specific tools.

Subcommands:
  add     Create a new repository configuration
  list    List all configured repositories
  show    Display the init script for a repository
  edit    Open the init script in your editor
  remove  Delete a repository configuration

Example workflow:
  sandctl repo add -R TryGhost/Ghost     # Create config
  sandctl repo edit TryGhost/Ghost       # Edit init script
  sandctl new -R TryGhost/Ghost          # Create session (runs init script)`,
}

func init() {
	rootCmd.AddCommand(repoCmd)
}

// getRepoStore returns the repo configuration store, creating it if needed.
func getRepoStore() *repoconfig.Store {
	if repoStore == nil {
		repoStore = repoconfig.NewStore("")
	}
	return repoStore
}
