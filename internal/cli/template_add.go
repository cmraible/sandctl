package cli

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/templateconfig"
)

var templateAddCmd = &cobra.Command{
	Use:   "add <name>",
	Short: "Create a new template configuration",
	Long: `Create a new template configuration with an init script template.

The init script will be stored at ~/.sandctl/templates/<name>/init.sh and will
be executed automatically when running 'sandctl new -T <name>'.

After creation, your default editor will open to customize the init script.`,
	Example: `  # Create a template
  sandctl template add Ghost

  # Create a template with spaces in the name
  sandctl template add "My Dev Env"`,
	Args: cobra.ExactArgs(1),
	RunE: runTemplateAdd,
}

func init() {
	templateCmd.AddCommand(templateAddCmd)
}

func runTemplateAdd(cmd *cobra.Command, args []string) error {
	name := args[0]

	// T029: Error handling for empty template name
	if name == "" {
		return fmt.Errorf("template name is required")
	}

	store := getTemplateStore()

	// Create the template
	config, err := store.Add(name)
	if err != nil {
		// T030: Error handling for duplicate template name
		if _, ok := err.(*templateconfig.AlreadyExistsError); ok {
			fmt.Fprintf(os.Stderr, "Error: Template '%s' already exists. Use 'sandctl template edit %s' to modify it.\n", name, name)
			return nil
		}
		return fmt.Errorf("failed to create template: %w", err)
	}

	// Get the script path to open in editor
	scriptPath, err := store.GetInitScriptPath(name)
	if err != nil {
		return fmt.Errorf("failed to get init script path: %w", err)
	}

	fmt.Printf("Created template '%s'\n", config.OriginalName)
	fmt.Printf("Opening init script in editor...\n")

	// T028: Implement editor detection
	editor := findEditor()
	if editor == "" {
		fmt.Fprintf(os.Stderr, "Error: No editor found. Set the EDITOR environment variable.\n")
		fmt.Printf("Edit your script at: %s\n", scriptPath)
		return nil
	}

	// Open editor
	editorCmd := exec.Command(editor, scriptPath)
	editorCmd.Stdin = os.Stdin
	editorCmd.Stdout = os.Stdout
	editorCmd.Stderr = os.Stderr

	if err := editorCmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Editor exited with error: %v\n", err)
		fmt.Printf("Edit your script at: %s\n", scriptPath)
	}

	fmt.Println()
	fmt.Printf("Template '%s' is ready. Use 'sandctl new -T %s' to create a session.\n", config.OriginalName, config.Template)

	return nil
}

// findEditor returns the path to the user's preferred editor.
// It checks EDITOR, VISUAL, then falls back to common defaults.
func findEditor() string {
	// Check EDITOR environment variable
	if editor := os.Getenv("EDITOR"); editor != "" {
		return editor
	}

	// Check VISUAL environment variable
	if editor := os.Getenv("VISUAL"); editor != "" {
		return editor
	}

	// Try common editors in order of preference
	editors := []string{"vim", "vi", "nano"}
	for _, editor := range editors {
		if path, err := exec.LookPath(editor); err == nil {
			return path
		}
	}

	return ""
}
