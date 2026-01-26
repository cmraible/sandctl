// Package api provides an HTTP REST API server for sandctl.
package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/sandctl/sandctl/internal/config"
	"github.com/sandctl/sandctl/internal/repoconfig"
	"github.com/sandctl/sandctl/internal/session"
)

// Server represents the HTTP API server.
type Server struct {
	addr         string
	sessionStore *session.Store
	repoStore    *repoconfig.Store
	config       *config.Config
	httpServer   *http.Server
	verbose      bool
}

// ServerOptions contains configuration options for the server.
type ServerOptions struct {
	Addr         string
	SessionStore *session.Store
	RepoStore    *repoconfig.Store
	Config       *config.Config
	Verbose      bool
}

// NewServer creates a new API server.
func NewServer(opts ServerOptions) *Server {
	if opts.Addr == "" {
		opts.Addr = ":8080"
	}
	if opts.SessionStore == nil {
		opts.SessionStore = session.NewStore("")
	}
	if opts.RepoStore == nil {
		opts.RepoStore = repoconfig.NewStore("")
	}

	s := &Server{
		addr:         opts.Addr,
		sessionStore: opts.SessionStore,
		repoStore:    opts.RepoStore,
		config:       opts.Config,
		verbose:      opts.Verbose,
	}

	return s
}

// Start starts the HTTP server.
func (s *Server) Start() error {
	mux := http.NewServeMux()
	s.registerRoutes(mux)

	s.httpServer = &http.Server{
		Addr:         s.addr,
		Handler:      s.middleware(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("Starting API server on %s", s.addr)
	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully shuts down the server.
func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}

// middleware adds common middleware to all requests.
func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Add CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Handle preflight requests
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Set content type for all responses
		w.Header().Set("Content-Type", "application/json")

		// Log request if verbose
		if s.verbose {
			log.Printf("%s %s", r.Method, r.URL.Path)
		}

		next.ServeHTTP(w, r)
	})
}

// registerRoutes sets up the API routes.
func (s *Server) registerRoutes(mux *http.ServeMux) {
	// Health check
	mux.HandleFunc("GET /health", s.handleHealth)

	// Sessions
	mux.HandleFunc("GET /sessions", s.handleListSessions)
	mux.HandleFunc("POST /sessions", s.handleCreateSession)
	mux.HandleFunc("GET /sessions/{id}", s.handleGetSession)
	mux.HandleFunc("DELETE /sessions/{id}", s.handleDestroySession)
	mux.HandleFunc("POST /sessions/{id}/exec", s.handleExecCommand)

	// Repos
	mux.HandleFunc("GET /repos", s.handleListRepos)
	mux.HandleFunc("POST /repos", s.handleAddRepo)
	mux.HandleFunc("GET /repos/{name}", s.handleGetRepo)
	mux.HandleFunc("PUT /repos/{name}", s.handleUpdateRepo)
	mux.HandleFunc("DELETE /repos/{name}", s.handleRemoveRepo)
}

// APIError represents an error response.
type APIError struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
	Code    int    `json:"code"`
}

// writeError writes an error response.
func writeError(w http.ResponseWriter, code int, err string, message string) {
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(APIError{
		Error:   err,
		Message: message,
		Code:    code,
	})
}

// writeJSON writes a JSON response.
func writeJSON(w http.ResponseWriter, code int, data interface{}) {
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(data)
}

// extractPathParam extracts a path parameter from the request.
// For Go 1.22+ with pattern matching like /sessions/{id}, use r.PathValue("id").
func extractPathParam(r *http.Request, param string) string {
	// Go 1.22+ native path value extraction
	if val := r.PathValue(param); val != "" {
		return val
	}

	// Fallback: manual extraction for older patterns
	// This handles patterns like /repos/{name} where we need to extract "name"
	path := r.URL.Path
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) >= 2 {
		return parts[len(parts)-1]
	}
	return ""
}
