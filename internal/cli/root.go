// Package cli implements the sandctl command-line interface.
package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/config"
	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sprites"
)

var (
	// Version information (set at build time via ldflags).
	version   = "dev"
	commit    = "unknown"
	buildTime = "unknown"

	// Global flags.
	cfgFile string
	verbose bool

	// Shared resources (initialized on demand).
	cfg           *config.Config
	sessionStore  *session.Store
	spritesClient *sprites.Client
)

// rootCmd represents the base command when called without any subcommands.
var rootCmd = &cobra.Command{
	Use:   "sandctl",
	Short: "Manage sandboxed AI web development agents",
	Long: `sandctl is a CLI tool for managing sandboxed AI web development agents.

It provisions isolated VM environments using Fly.io Sprites where AI coding
agents (Claude, OpenCode, Codex) can work on development tasks safely.

Commands:
  init     Initialize or update sandctl configuration
  new      Create a new sandboxed agent session
  list     List active sessions
  exec     Connect to a running session
  destroy  Terminate and remove a session

Get started:
  sandctl init
  sandctl new`,
	SilenceUsage:  true,
	SilenceErrors: true,
}

// Execute runs the root command.
func Execute() int {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}

// SetVersionInfo sets version information from build flags.
func SetVersionInfo(v, c, b string) {
	version = v
	commit = c
	buildTime = b
}

func init() {
	// Global flags
	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default: ~/.sandctl/config)")
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "enable verbose output")

	// Version command
	rootCmd.AddCommand(versionCmd)
}

// versionCmd shows version information.
var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Show version information",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("sandctl version %s\n", version)
		fmt.Printf("  commit: %s\n", commit)
		fmt.Printf("  built:  %s\n", buildTime)
	},
}

// loadConfig loads the configuration file.
func loadConfig() (*config.Config, error) {
	if cfg != nil {
		return cfg, nil
	}

	path := cfgFile
	if path == "" {
		path = config.DefaultConfigPath()
	}

	var err error
	cfg, err = config.Load(path)
	if err != nil {
		return nil, err
	}

	return cfg, nil
}

// getSessionStore returns the session store, creating it if needed.
func getSessionStore() *session.Store {
	if sessionStore == nil {
		sessionStore = session.NewStore("")
	}
	return sessionStore
}

// getSpritesClient returns the Sprites API client, creating it if needed.
func getSpritesClient() (*sprites.Client, error) {
	if spritesClient != nil {
		return spritesClient, nil
	}

	cfg, err := loadConfig()
	if err != nil {
		return nil, err
	}

	spritesClient = sprites.NewClient(cfg.SpritesToken)
	return spritesClient, nil
}

// isVerbose returns true if verbose output is enabled.
func isVerbose() bool {
	return verbose
}

// verboseLog prints a message if verbose mode is enabled.
func verboseLog(format string, args ...interface{}) {
	if verbose {
		fmt.Printf("[debug] "+format+"\n", args...)
	}
}
