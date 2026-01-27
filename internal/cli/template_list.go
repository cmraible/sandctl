package cli

import (
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/spf13/cobra"
)

var templateListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all configured templates",
	Long: `List all configured templates.

Displays a table of templates with their names and creation dates.`,
	Example: `  # List all templates
  sandctl template list`,
	Args: cobra.NoArgs,
	RunE: runTemplateList,
}

func init() {
	templateCmd.AddCommand(templateListCmd)
}

func runTemplateList(cmd *cobra.Command, args []string) error {
	store := getTemplateStore()

	configs, err := store.List()
	if err != nil {
		return fmt.Errorf("failed to list templates: %w", err)
	}

	// T040: Handle empty list
	if len(configs) == 0 {
		fmt.Println("No templates configured.")
		fmt.Println()
		fmt.Println("Create one with: sandctl template add <name>")
		return nil
	}

	// T039: Tabular output with NAME and CREATED columns
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "NAME\tCREATED")

	for _, config := range configs {
		fmt.Fprintf(w, "%s\t%s\n",
			config.OriginalName,
			config.CreatedAt.Format("2006-01-02 15:04:05"),
		)
	}

	return w.Flush()
}
