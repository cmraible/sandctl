// Package cli implements the sandctl command-line interface.
package cli

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/config"
	// Import hetzner to register the provider
	_ "github.com/sandctl/sandctl/internal/hetzner"
	"github.com/sandctl/sandctl/internal/provider"
	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sshagent"
	"github.com/sandctl/sandctl/internal/sshexec"
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
	cfg          *config.Config
	sessionStore *session.Store
)

// rootCmd represents the base command when called without any subcommands.
var rootCmd = &cobra.Command{
	Use:   "sandctl",
	Short: "Manage sandboxed AI web development agents",
	Long: `sandctl is a CLI tool for managing sandboxed AI web development agents.

It provisions isolated VM environments using pluggable cloud providers where
AI coding agents (Claude, OpenCode, Codex) can work on development tasks safely.

Supported providers: Hetzner Cloud (default)

Commands:
  init     Initialize or update sandctl configuration
  new      Create a new sandboxed agent session
  list     List active sessions
  console  Open an interactive console to a session (SSH-like)
  exec     Execute commands in a running session
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

// getProvider returns a provider by name, using the default if empty.
func getProvider(name string) (provider.Provider, error) {
	cfg, err := loadConfig()
	if err != nil {
		return nil, err
	}

	// Check for legacy config
	if cfg.IsLegacyConfig() {
		return nil, fmt.Errorf("legacy configuration detected\n\n%s", config.MigrationInstructions())
	}

	if name == "" {
		name = cfg.DefaultProvider
	}

	p, err := provider.Get(name, cfg)
	if err != nil {
		return nil, err
	}

	return p, nil
}

// getProviderFromSession returns the provider for a specific session.
func getProviderFromSession(sess *session.Session) (provider.Provider, error) {
	if sess.IsLegacySession() {
		return nil, fmt.Errorf("session '%s' is from an old version and incompatible with current sandctl", sess.ID)
	}

	return getProvider(sess.Provider)
}

// createSSHClient creates an SSH client for the given host.
// Handles both file mode (using private key file) and agent mode (using SSH agent).
func createSSHClient(host string) (*sshexec.Client, error) {
	cfg, err := loadConfig()
	if err != nil {
		return nil, err
	}

	if cfg.IsAgentMode() {
		// Agent mode - get signer from SSH agent by fingerprint
		signer, err := sshagent.GetSignerByFingerprint(cfg.SSHKeyFingerprint)
		if err != nil {
			return nil, fmt.Errorf("failed to get SSH key from agent: %w", err)
		}
		return sshexec.NewClientWithSigner(host, signer), nil
	}

	// File mode - use private key file
	pubKeyPath := cfg.ExpandSSHPublicKeyPath()
	if pubKeyPath == "" {
		return nil, fmt.Errorf("ssh_public_key not configured")
	}

	privateKeyPath := strings.TrimSuffix(pubKeyPath, ".pub")
	return sshexec.NewClient(host, privateKeyPath)
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
