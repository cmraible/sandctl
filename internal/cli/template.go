package cli

import (
	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/templateconfig"
)

var (
	templateStore *templateconfig.Store
)

// templateCmd represents the template parent command.
var templateCmd = &cobra.Command{
	Use:   "template",
	Short: "Manage template configurations",
	Long: `Manage templates for sandctl sessions.

Templates allow you to define initialization scripts that run
automatically when creating a session with the -T flag. This is useful for
setting up development environments, installing dependencies, and configuring
project-specific tools.

Subcommands:
  add     Create a new template configuration
  list    List all configured templates
  show    Display the init script for a template
  edit    Open the init script in your editor
  remove  Delete a template configuration

Example workflow:
  sandctl template add Ghost          # Create template
  sandctl template edit Ghost         # Edit init script
  sandctl new -T Ghost                # Create session (runs init script)`,
}

func init() {
	rootCmd.AddCommand(templateCmd)
}

// getTemplateStore returns the template configuration store, creating it if needed.
func getTemplateStore() *templateconfig.Store {
	if templateStore == nil {
		var err error
		templateStore, err = templateconfig.NewStore()
		if err != nil {
			// This should never fail in practice since NewStore just sets a path
			panic(err)
		}
	}
	return templateStore
}
