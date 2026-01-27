package cli

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/templateconfig"
)

var templateEditCmd = &cobra.Command{
	Use:   "edit <name>",
	Short: "Edit a template's init script",
	Long: `Open a template's init script in your default editor.

The editor is determined by checking the EDITOR environment variable,
then VISUAL, then falling back to vim, vi, or nano.`,
	Example: `  # Edit a template
  sandctl template edit Ghost`,
	Args: cobra.ExactArgs(1),
	RunE: runTemplateEdit,
}

func init() {
	templateCmd.AddCommand(templateEditCmd)
}

func runTemplateEdit(cmd *cobra.Command, args []string) error {
	name := args[0]

	store := getTemplateStore()

	// T043: Error handling for non-existent template
	scriptPath, err := store.GetInitScriptPath(name)
	if err != nil {
		if _, ok := err.(*templateconfig.NotFoundError); ok {
			return fmt.Errorf("template '%s' not found. Use 'sandctl template list' to see available templates", name)
		}
		return fmt.Errorf("failed to get template: %w", err)
	}

	// T042: Editor detection (reuse pattern from template_add)
	editor := findEditor()
	if editor == "" {
		return fmt.Errorf("no editor found. Set the EDITOR environment variable")
	}

	// Open editor
	editorCmd := exec.Command(editor, scriptPath)
	editorCmd.Stdin = os.Stdin
	editorCmd.Stdout = os.Stdout
	editorCmd.Stderr = os.Stderr

	if err := editorCmd.Run(); err != nil {
		return fmt.Errorf("editor exited with error: %w", err)
	}

	return nil
}
