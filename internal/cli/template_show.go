package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/templateconfig"
)

var templateShowCmd = &cobra.Command{
	Use:   "show <name>",
	Short: "Display a template's init script",
	Long: `Display the contents of a template's init script to stdout.

This is useful for viewing the script without opening an editor.`,
	Example: `  # Show a template's init script
  sandctl template show Ghost`,
	Args: cobra.ExactArgs(1),
	RunE: runTemplateShow,
}

func init() {
	templateCmd.AddCommand(templateShowCmd)
}

func runTemplateShow(cmd *cobra.Command, args []string) error {
	name := args[0]

	store := getTemplateStore()

	// T046: Error handling for non-existent template
	content, err := store.GetInitScript(name)
	if err != nil {
		if _, ok := err.(*templateconfig.NotFoundError); ok {
			return fmt.Errorf("template '%s' not found. Use 'sandctl template list' to see available templates", name)
		}
		return fmt.Errorf("failed to read template: %w", err)
	}

	// T045: Output init script content to stdout
	fmt.Print(content)

	return nil
}
