package cli

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/sandctl/sandctl/internal/templateconfig"
)

var (
	templateRemoveForce bool
)

var templateRemoveCmd = &cobra.Command{
	Use:   "remove <name>",
	Short: "Delete a template",
	Long: `Delete a template configuration and its init script.

By default, this command prompts for confirmation before deleting.
Use --force to skip the confirmation prompt.`,
	Example: `  # Remove a template (with confirmation)
  sandctl template remove Ghost

  # Remove without confirmation
  sandctl template remove Ghost --force`,
	Args: cobra.ExactArgs(1),
	RunE: runTemplateRemove,
}

func init() {
	// T050: Add --force/-f flag
	templateRemoveCmd.Flags().BoolVarP(&templateRemoveForce, "force", "f", false, "skip confirmation prompt")

	templateCmd.AddCommand(templateRemoveCmd)
}

func runTemplateRemove(cmd *cobra.Command, args []string) error {
	name := args[0]

	store := getTemplateStore()

	// T051: Error handling for non-existent template
	if !store.Exists(name) {
		return fmt.Errorf("template '%s' not found. Use 'sandctl template list' to see available templates", name)
	}

	// T048-T049: Interactive confirmation prompt
	if !templateRemoveForce {
		// T049: Terminal detection
		if !term.IsTerminal(int(os.Stdin.Fd())) {
			// T052: Error handling for non-interactive mode without --force
			return fmt.Errorf("confirmation required. Run in interactive terminal or use --force flag")
		}

		// T048: Interactive confirmation prompt
		fmt.Printf("Delete template '%s'? [y/N] ", name)
		reader := bufio.NewReader(os.Stdin)
		response, err := reader.ReadString('\n')
		if err != nil {
			return fmt.Errorf("failed to read input: %w", err)
		}

		response = strings.TrimSpace(strings.ToLower(response))
		if response != "y" && response != "yes" {
			fmt.Println("Canceled.")
			return nil
		}
	}

	// Delete the template
	if err := store.Remove(name); err != nil {
		if _, ok := err.(*templateconfig.NotFoundError); ok {
			return fmt.Errorf("template '%s' not found", name)
		}
		return fmt.Errorf("failed to remove template: %w", err)
	}

	fmt.Printf("Template '%s' deleted.\n", name)
	return nil
}
