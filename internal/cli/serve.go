package cli

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/sandctl/sandctl/internal/api"
	"github.com/sandctl/sandctl/internal/repoconfig"
)

var (
	serveAddr string
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the HTTP REST API server",
	Long: `Start an HTTP REST API server that mirrors the CLI functionality.

The server provides endpoints for managing sessions and repositories:

Sessions:
  GET    /sessions          List all sessions
  POST   /sessions          Create a new session
  GET    /sessions/{id}     Get a session by ID
  DELETE /sessions/{id}     Destroy a session
  POST   /sessions/{id}/exec  Execute a command in a session

Repos:
  GET    /repos             List all repo configurations
  POST   /repos             Add a new repo configuration
  GET    /repos/{name}      Get a repo configuration
  PUT    /repos/{name}      Update a repo configuration
  DELETE /repos/{name}      Remove a repo configuration

Other:
  GET    /health            Health check endpoint`,
	Example: `  # Start server on default port (8080)
  sandctl serve

  # Start server on custom port
  sandctl serve --addr :3000

  # Start server with verbose logging
  sandctl serve -v`,
	RunE: runServe,
}

func init() {
	serveCmd.Flags().StringVar(&serveAddr, "addr", ":8080", "address to listen on (e.g., :8080, localhost:3000)")

	rootCmd.AddCommand(serveCmd)
}

func runServe(cmd *cobra.Command, args []string) error {
	// Load configuration
	cfg, err := loadConfig()
	if err != nil {
		// Config is optional for serve - some endpoints may work without it
		verboseLog("Warning: could not load config: %v", err)
	}

	// Create server
	server := api.NewServer(api.ServerOptions{
		Addr:         serveAddr,
		SessionStore: getSessionStore(),
		RepoStore:    repoconfig.NewStore(""),
		Config:       cfg,
		Verbose:      isVerbose(),
	})

	// Handle graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Start server in goroutine
	errChan := make(chan error, 1)
	go func() {
		errChan <- server.Start()
	}()

	// Wait for shutdown signal or error
	select {
	case err := <-errChan:
		if err != nil {
			return fmt.Errorf("server error: %w", err)
		}
	case <-ctx.Done():
		fmt.Println("\nShutting down server...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown error: %w", err)
		}
		fmt.Println("Server stopped.")
	}

	return nil
}
