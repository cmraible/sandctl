package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/repoconfig"
)

var repoListJSON bool

var repoListCmd = &cobra.Command{
	Use:     "list",
	Short:   "List all configured repositories",
	Aliases: []string{"ls"},
	Long: `List all repository configurations with init scripts.

Displays each configured repository with its creation date and custom timeout
(if set). Use --json for machine-readable output.`,
	Example: `  # List all configured repositories
  sandctl repo list

  # Output as JSON
  sandctl repo list --json`,
	RunE: runRepoList,
}

func init() {
	repoListCmd.Flags().BoolVar(&repoListJSON, "json", false, "output as JSON")

	repoCmd.AddCommand(repoListCmd)
}

func runRepoList(cmd *cobra.Command, args []string) error {
	store := getRepoStore()

	configs, err := store.List()
	if err != nil {
		return fmt.Errorf("failed to list configurations: %w", err)
	}

	// Handle empty state
	if len(configs) == 0 {
		fmt.Println("No repository configurations found.")
		fmt.Println("Use 'sandctl repo add' to create one.")
		return nil
	}

	if repoListJSON {
		return outputRepoJSON(configs)
	}

	return outputRepoTable(configs)
}

// repoJSONOutput is the JSON representation of a repo config.
type repoJSONOutput struct {
	Repo         string `json:"repo"`
	OriginalName string `json:"original_name"`
	CreatedAt    string `json:"created_at"`
	Timeout      string `json:"timeout"`
}

func outputRepoJSON(configs []repoconfig.RepoConfig) error {
	output := make([]repoJSONOutput, len(configs))
	for i, cfg := range configs {
		timeout := cfg.GetTimeout().String()
		output[i] = repoJSONOutput{
			Repo:         cfg.Repo,
			OriginalName: cfg.OriginalName,
			CreatedAt:    cfg.CreatedAt.Format(time.RFC3339),
			Timeout:      timeout,
		}
	}

	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(output)
}

func outputRepoTable(configs []repoconfig.RepoConfig) error {
	// Print header
	fmt.Printf("%-25s %-20s %s\n", "REPOSITORY", "CREATED", "TIMEOUT")

	// Print configs
	for _, cfg := range configs {
		created := cfg.CreatedAt.Local().Format("2006-01-02 15:04")
		timeout := formatRepoTimeout(cfg)

		fmt.Printf("%-25s %-20s %s\n",
			cfg.OriginalName,
			created,
			timeout,
		)
	}

	return nil
}

func formatRepoTimeout(cfg repoconfig.RepoConfig) string {
	timeout := cfg.GetTimeout()
	if timeout == repoconfig.DefaultTimeout {
		return "10m"
	}
	return timeout.String()
}
