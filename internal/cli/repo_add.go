package cli

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/repo"
	"github.com/sandctl/sandctl/internal/repoconfig"
	"github.com/sandctl/sandctl/internal/ui"
)

var (
	repoAddRepo    string
	repoAddTimeout string
)

var repoAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Create a new repository configuration",
	Long: `Create a new repository configuration with an init script template.

The init script will be stored at ~/.sandctl/repos/<repo>/init.sh and will
be executed automatically when running 'sandctl new -R <repo>'.

After creation, use 'sandctl repo edit' to customize the init script.`,
	Example: `  # Interactive mode (prompts for repository)
  sandctl repo add

  # Specify repository via flag
  sandctl repo add -R TryGhost/Ghost

  # With custom timeout for long init scripts
  sandctl repo add -R large/monorepo --timeout 30m`,
	RunE: runRepoAdd,
}

func init() {
	repoAddCmd.Flags().StringVarP(&repoAddRepo, "repo", "R", "", "repository name (owner/repo) or GitHub URL")
	repoAddCmd.Flags().StringVarP(&repoAddTimeout, "timeout", "t", "", "init script execution timeout (default: 10m)")

	repoCmd.AddCommand(repoAddCmd)
}

func runRepoAdd(cmd *cobra.Command, args []string) error {
	store := getRepoStore()

	// Get repository name from flag or prompt
	repoName := repoAddRepo
	if repoName == "" {
		// Check if running interactively
		if !ui.IsTerminal() {
			return fmt.Errorf("--repo flag is required in non-interactive mode")
		}

		prompter := ui.DefaultPrompter()
		var err error
		repoName, err = prompter.PromptString("Repository (owner/repo or URL)", "")
		if err != nil {
			return err
		}
		if repoName == "" {
			return fmt.Errorf("repository name is required")
		}
	}

	// Parse and validate repository specification
	repoSpec, err := repo.Parse(repoName)
	if err != nil {
		return fmt.Errorf("invalid repository: %w", err)
	}

	// Parse timeout if provided
	var timeout time.Duration
	if repoAddTimeout != "" {
		timeout, err = time.ParseDuration(repoAddTimeout)
		if err != nil {
			return fmt.Errorf("invalid timeout format: %w", err)
		}
	}

	// Create the configuration
	config := repoconfig.RepoConfig{
		OriginalName: repoSpec.String(),
		CreatedAt:    time.Now().UTC(),
		Timeout:      repoconfig.Duration{Duration: timeout},
	}

	if err := store.Add(config); err != nil {
		var alreadyExists *repoconfig.AlreadyExistsError
		if _, ok := err.(*repoconfig.AlreadyExistsError); ok {
			alreadyExists = err.(*repoconfig.AlreadyExistsError)
			fmt.Fprintf(os.Stderr, "Error: %s\n", alreadyExists.Error())
			fmt.Fprintf(os.Stderr, "Use 'sandctl repo edit %s' to modify the init script\n", repoSpec.String())
			return nil
		}
		return fmt.Errorf("failed to create configuration: %w", err)
	}

	// Print success message
	normalizedName := repoconfig.NormalizeName(repoSpec.String())
	scriptPath := store.GetInitScriptPath(repoSpec.String())

	fmt.Printf("Created init script for %s\n", repoSpec.String())
	fmt.Printf("Edit your script at: %s\n", scriptPath)
	fmt.Println()
	fmt.Printf("Tip: Use 'sandctl repo edit %s' to open in your editor\n", normalizedName)

	return nil
}
