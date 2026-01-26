package cli

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/repoconfig"
)

var repoEditCmd = &cobra.Command{
	Use:   "edit <repository>",
	Short: "Open the init script in your editor",
	Long: `Open a repository's init script in your preferred editor.

The editor is determined by checking $VISUAL, then $EDITOR, falling back to vi.
The repository can be specified as owner/repo or the normalized name.`,
	Example: `  # Edit init script
  sandctl repo edit TryGhost/Ghost

  # Using normalized name
  sandctl repo edit tryghost-ghost`,
	Args: cobra.ExactArgs(1),
	RunE: runRepoEdit,
}

func init() {
	repoCmd.AddCommand(repoEditCmd)
}

func runRepoEdit(cmd *cobra.Command, args []string) error {
	repoName := args[0]
	store := getRepoStore()

	// Check if config exists
	_, err := store.Get(repoName)
	if err != nil {
		var notFound *repoconfig.NotFoundError
		if _, ok := err.(*repoconfig.NotFoundError); ok {
			notFound = err.(*repoconfig.NotFoundError)
			fmt.Fprintf(os.Stderr, "Error: %s\n", notFound.Error())
			fmt.Fprintln(os.Stderr, "Use 'sandctl repo add' to create one")
			return nil
		}
		return err
	}

	// Get script path
	scriptPath := store.GetInitScriptPath(repoName)
	if scriptPath == "" {
		return fmt.Errorf("init script not found for '%s'", repoName)
	}

	// Open in editor
	editor := getEditor()
	fmt.Printf("Opening in %s...\n", editor)

	return openInEditor(editor, scriptPath)
}

// getEditor returns the user's preferred editor.
func getEditor() string {
	if editor := os.Getenv("VISUAL"); editor != "" {
		return editor
	}
	if editor := os.Getenv("EDITOR"); editor != "" {
		return editor
	}
	return "vi"
}

// openInEditor opens a file in the specified editor.
func openInEditor(editor, path string) error {
	cmd := exec.Command(editor, path)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
