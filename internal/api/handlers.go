package api

import (
	"context"
	"crypto/md5" //nolint:gosec // Used for unique naming, not security
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/sandctl/sandctl/internal/hetzner"
	"github.com/sandctl/sandctl/internal/provider"
	"github.com/sandctl/sandctl/internal/repoconfig"
	"github.com/sandctl/sandctl/internal/repo"
	"github.com/sandctl/sandctl/internal/session"
	"github.com/sandctl/sandctl/internal/sshexec"
)

// HealthResponse represents the health check response.
type HealthResponse struct {
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
}

// handleHealth handles GET /health.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, HealthResponse{
		Status:    "ok",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

// ListSessionsResponse represents the response for listing sessions.
type ListSessionsResponse struct {
	Sessions []session.Session `json:"sessions"`
	Total    int               `json:"total"`
}

// handleListSessions handles GET /sessions.
func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	// Check for "all" query parameter
	showAll := r.URL.Query().Get("all") == "true"

	var sessions []session.Session
	var err error

	if showAll {
		sessions, err = s.sessionStore.List()
	} else {
		sessions, err = s.sessionStore.ListActive()
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}

	// Sync with provider API
	sessions = s.syncSessionsWithProvider(r.Context(), sessions)

	writeJSON(w, http.StatusOK, ListSessionsResponse{
		Sessions: sessions,
		Total:    len(sessions),
	})
}

// CreateSessionRequest represents the request body for creating a session.
type CreateSessionRequest struct {
	Timeout    string `json:"timeout,omitempty"`    // Duration string like "1h", "30m"
	Repo       string `json:"repo,omitempty"`       // GitHub repository (owner/repo or URL)
	Provider   string `json:"provider,omitempty"`   // Provider name (default: from config)
	Region     string `json:"region,omitempty"`     // Region override
	ServerType string `json:"server_type,omitempty"` // Server type override
	Image      string `json:"image,omitempty"`      // OS image override
}

// CreateSessionResponse represents the response for creating a session.
type CreateSessionResponse struct {
	Session session.Session `json:"session"`
	Message string          `json:"message"`
}

// handleCreateSession handles POST /sessions.
func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Check config is available
	if s.config == nil {
		writeError(w, http.StatusInternalServerError, "not_configured", "sandctl is not configured. Run 'sandctl init' first.")
		return
	}

	var req CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err.Error() != "EOF" {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid JSON body: "+err.Error())
		return
	}

	// Parse repository specification if provided
	var repoSpec *repo.Spec
	if req.Repo != "" {
		var err error
		repoSpec, err = repo.Parse(req.Repo)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_repo", err.Error())
			return
		}
	}

	// Parse timeout if provided
	var timeout *session.Duration
	if req.Timeout != "" {
		d, err := time.ParseDuration(req.Timeout)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_timeout", "Invalid timeout format: "+err.Error())
			return
		}
		timeout = &session.Duration{Duration: d}
	}

	// Get provider
	providerName := req.Provider
	if providerName == "" {
		providerName = s.config.DefaultProvider
	}

	prov, err := provider.Get(providerName, s.config)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "provider_error", err.Error())
		return
	}

	// Generate session ID
	usedNames, err := s.sessionStore.GetUsedNames()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}

	sessionID, err := session.GenerateID(usedNames)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "id_generation_failed", err.Error())
		return
	}

	// Ensure SSH key is uploaded to provider
	sshKeyID, err := s.ensureSSHKey(ctx, prov)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "ssh_key_error", err.Error())
		return
	}

	// Build cloud-init script
	userData := hetzner.CloudInitScript()
	if repoSpec != nil {
		userData = hetzner.CloudInitScriptWithRepo(repoSpec.CloneURL, repoSpec.TargetPath())
	}

	// Create VM options
	createOpts := provider.CreateOpts{
		Name:       sessionID,
		SSHKeyID:   sshKeyID,
		Region:     req.Region,
		ServerType: req.ServerType,
		Image:      req.Image,
		UserData:   userData,
	}

	// Create session record (provisioning state)
	sess := session.Session{
		ID:        sessionID,
		Status:    session.StatusProvisioning,
		CreatedAt: time.Now().UTC(),
		Timeout:   timeout,
		Provider:  prov.Name(),
	}

	// Add to local store immediately
	if err := s.sessionStore.Add(sess); err != nil {
		writeError(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}

	// Create VM asynchronously - return immediately with provisioning status
	go s.provisionSession(ctx, prov, createOpts, sess, repoSpec)

	writeJSON(w, http.StatusAccepted, CreateSessionResponse{
		Session: sess,
		Message: fmt.Sprintf("Session '%s' is being provisioned. Poll GET /sessions/%s for status.", sessionID, sessionID),
	})
}

// provisionSession handles the async provisioning of a session.
func (s *Server) provisionSession(ctx context.Context, prov provider.Provider, opts provider.CreateOpts, sess session.Session, repoSpec *repo.Spec) {
	// Create VM
	vm, err := prov.Create(ctx, opts)
	if err != nil {
		s.sessionStore.Update(sess.ID, session.StatusFailed)
		return
	}

	// Wait for VM to be ready
	if err := prov.WaitReady(ctx, vm.ID, 5*time.Minute); err != nil {
		prov.Delete(ctx, vm.ID)
		s.sessionStore.Update(sess.ID, session.StatusFailed)
		return
	}

	// Refresh VM info to get IP
	vm, err = prov.Get(ctx, vm.ID)
	if err != nil {
		prov.Delete(ctx, vm.ID)
		s.sessionStore.Update(sess.ID, session.StatusFailed)
		return
	}

	// Wait for cloud-init if repo cloning
	if repoSpec != nil {
		if err := s.waitForCloudInit(vm.IPAddress, 3*time.Minute); err != nil {
			// Don't fail the session, just log
		}

		// Run custom init script if exists
		if initScript, err := s.repoStore.GetInitScript(repoSpec.String()); err == nil && initScript != "" {
			s.runInitScript(vm.IPAddress, repoSpec.TargetPath(), initScript)
		}
	}

	// Setup OpenCode if configured
	if s.config != nil && s.config.OpencodeZenKey != "" {
		s.setupOpenCode(vm.IPAddress)
	}

	// Update session with provider info
	sess.Status = session.StatusRunning
	sess.ProviderID = vm.ID
	sess.IPAddress = vm.IPAddress
	s.sessionStore.UpdateSession(sess)
}

// handleGetSession handles GET /sessions/{id}.
func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	sessionID := session.NormalizeName(r.PathValue("id"))
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing_id", "Session ID is required")
		return
	}

	sess, err := s.sessionStore.Get(sessionID)
	if err != nil {
		var notFound *session.NotFoundError
		if errors.As(err, &notFound) {
			writeError(w, http.StatusNotFound, "not_found", fmt.Sprintf("Session '%s' not found", sessionID))
			return
		}
		writeError(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}

	// Sync with provider if possible
	sess = s.syncSessionWithProvider(r.Context(), sess)

	writeJSON(w, http.StatusOK, sess)
}

// DestroySessionResponse represents the response for destroying a session.
type DestroySessionResponse struct {
	Message string `json:"message"`
	ID      string `json:"id"`
}

// handleDestroySession handles DELETE /sessions/{id}.
func (s *Server) handleDestroySession(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sessionID := session.NormalizeName(r.PathValue("id"))
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing_id", "Session ID is required")
		return
	}

	sess, err := s.sessionStore.Get(sessionID)
	if err != nil {
		var notFound *session.NotFoundError
		if errors.As(err, &notFound) {
			writeError(w, http.StatusNotFound, "not_found", fmt.Sprintf("Session '%s' not found", sessionID))
			return
		}
		writeError(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}

	// Delete VM from provider if possible
	if sess.Provider != "" && sess.ProviderID != "" && s.config != nil {
		prov, err := provider.Get(sess.Provider, s.config)
		if err == nil {
			prov.Delete(ctx, sess.ProviderID)
		}
	}

	// Remove from local store
	if err := s.sessionStore.Remove(sessionID); err != nil {
		writeError(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, DestroySessionResponse{
		Message: fmt.Sprintf("Session '%s' destroyed", sessionID),
		ID:      sessionID,
	})
}

// ExecRequest represents the request body for executing a command.
type ExecRequest struct {
	Command string `json:"command"`
}

// ExecResponse represents the response for executing a command.
type ExecResponse struct {
	Output   string `json:"output"`
	ExitCode int    `json:"exit_code"`
}

// handleExecCommand handles POST /sessions/{id}/exec.
func (s *Server) handleExecCommand(w http.ResponseWriter, r *http.Request) {
	sessionID := session.NormalizeName(r.PathValue("id"))
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing_id", "Session ID is required")
		return
	}

	var req ExecRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid JSON body: "+err.Error())
		return
	}

	if req.Command == "" {
		writeError(w, http.StatusBadRequest, "missing_command", "Command is required")
		return
	}

	sess, err := s.sessionStore.Get(sessionID)
	if err != nil {
		var notFound *session.NotFoundError
		if errors.As(err, &notFound) {
			writeError(w, http.StatusNotFound, "not_found", fmt.Sprintf("Session '%s' not found", sessionID))
			return
		}
		writeError(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}

	if sess.Status != session.StatusRunning {
		writeError(w, http.StatusBadRequest, "not_running", fmt.Sprintf("Session '%s' is not running (status: %s)", sessionID, sess.Status))
		return
	}

	if sess.IPAddress == "" {
		writeError(w, http.StatusBadRequest, "no_ip", fmt.Sprintf("Session '%s' has no IP address", sessionID))
		return
	}

	// Get SSH private key path
	privateKeyPath, err := s.getSSHPrivateKeyPath()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "ssh_error", err.Error())
		return
	}

	// Create SSH client and execute command
	client, err := sshexec.NewClient(sess.IPAddress, privateKeyPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "ssh_error", "Failed to connect: "+err.Error())
		return
	}
	defer client.Close()

	output, err := client.Exec(req.Command)
	exitCode := 0
	if err != nil {
		// Try to extract exit code from error
		exitCode = 1
	}

	writeJSON(w, http.StatusOK, ExecResponse{
		Output:   output,
		ExitCode: exitCode,
	})
}

// ListReposResponse represents the response for listing repos.
type ListReposResponse struct {
	Repos []repoconfig.RepoConfig `json:"repos"`
	Total int                     `json:"total"`
}

// handleListRepos handles GET /repos.
func (s *Server) handleListRepos(w http.ResponseWriter, r *http.Request) {
	repos, err := s.repoStore.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, ListReposResponse{
		Repos: repos,
		Total: len(repos),
	})
}

// AddRepoRequest represents the request body for adding a repo.
type AddRepoRequest struct {
	Repo    string `json:"repo"`              // Repository name (owner/repo or URL)
	Timeout string `json:"timeout,omitempty"` // Custom timeout duration
}

// AddRepoResponse represents the response for adding a repo.
type AddRepoResponse struct {
	Repo    repoconfig.RepoConfig `json:"repo"`
	Message string                `json:"message"`
}

// handleAddRepo handles POST /repos.
func (s *Server) handleAddRepo(w http.ResponseWriter, r *http.Request) {
	var req AddRepoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid JSON body: "+err.Error())
		return
	}

	if req.Repo == "" {
		writeError(w, http.StatusBadRequest, "missing_repo", "Repository name is required")
		return
	}

	// Parse repository to validate
	repoSpec, err := repo.Parse(req.Repo)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_repo", err.Error())
		return
	}

	// Parse timeout if provided
	var timeout repoconfig.Duration
	if req.Timeout != "" {
		d, err := time.ParseDuration(req.Timeout)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_timeout", "Invalid timeout format: "+err.Error())
			return
		}
		timeout = repoconfig.Duration{Duration: d}
	}

	config := repoconfig.RepoConfig{
		OriginalName: repoSpec.String(),
		CreatedAt:    time.Now().UTC(),
		Timeout:      timeout,
	}

	if err := s.repoStore.Add(config); err != nil {
		var exists *repoconfig.AlreadyExistsError
		if errors.As(err, &exists) {
			writeError(w, http.StatusConflict, "already_exists", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}

	// Retrieve the saved config to get the normalized name
	savedConfig, _ := s.repoStore.Get(repoSpec.String())
	if savedConfig == nil {
		savedConfig = &config
	}

	writeJSON(w, http.StatusCreated, AddRepoResponse{
		Repo:    *savedConfig,
		Message: fmt.Sprintf("Repository '%s' configured. Edit init script at ~/.sandctl/repos/%s/init.sh", repoSpec.String(), repoconfig.NormalizeName(repoSpec.String())),
	})
}

// GetRepoResponse represents the response for getting a repo.
type GetRepoResponse struct {
	Repo       repoconfig.RepoConfig `json:"repo"`
	InitScript string                `json:"init_script,omitempty"`
}

// handleGetRepo handles GET /repos/{name}.
func (s *Server) handleGetRepo(w http.ResponseWriter, r *http.Request) {
	repoName := r.PathValue("name")
	if repoName == "" {
		writeError(w, http.StatusBadRequest, "missing_name", "Repository name is required")
		return
	}

	// URL decode the name (handles owner/repo as owner%2Frepo)
	repoName = strings.ReplaceAll(repoName, "%2F", "/")

	config, err := s.repoStore.Get(repoName)
	if err != nil {
		var notFound *repoconfig.NotFoundError
		if errors.As(err, &notFound) {
			writeError(w, http.StatusNotFound, "not_found", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}

	// Get init script content
	initScript, _ := s.repoStore.GetInitScript(repoName)

	writeJSON(w, http.StatusOK, GetRepoResponse{
		Repo:       *config,
		InitScript: initScript,
	})
}

// UpdateRepoRequest represents the request body for updating a repo.
type UpdateRepoRequest struct {
	InitScript string `json:"init_script,omitempty"` // New init script content
	Timeout    string `json:"timeout,omitempty"`     // New timeout duration
}

// handleUpdateRepo handles PUT /repos/{name}.
func (s *Server) handleUpdateRepo(w http.ResponseWriter, r *http.Request) {
	repoName := r.PathValue("name")
	if repoName == "" {
		writeError(w, http.StatusBadRequest, "missing_name", "Repository name is required")
		return
	}

	// URL decode the name
	repoName = strings.ReplaceAll(repoName, "%2F", "/")

	var req UpdateRepoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid JSON body: "+err.Error())
		return
	}

	config, err := s.repoStore.Get(repoName)
	if err != nil {
		var notFound *repoconfig.NotFoundError
		if errors.As(err, &notFound) {
			writeError(w, http.StatusNotFound, "not_found", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}

	// Update timeout if provided
	if req.Timeout != "" {
		d, err := time.ParseDuration(req.Timeout)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_timeout", "Invalid timeout format: "+err.Error())
			return
		}
		config.Timeout = repoconfig.Duration{Duration: d}
		if err := s.repoStore.Update(*config); err != nil {
			writeError(w, http.StatusInternalServerError, "store_error", err.Error())
			return
		}
	}

	// Update init script if provided
	if req.InitScript != "" {
		normalizedName := repoconfig.NormalizeName(repoName)
		scriptPath := fmt.Sprintf("%s/%s/init.sh", repoconfig.DefaultReposPath(), normalizedName)
		if err := os.WriteFile(scriptPath, []byte(req.InitScript), 0700); err != nil {
			writeError(w, http.StatusInternalServerError, "write_error", "Failed to write init script: "+err.Error())
			return
		}
	}

	// Get updated config
	updatedConfig, _ := s.repoStore.Get(repoName)
	initScript, _ := s.repoStore.GetInitScript(repoName)

	writeJSON(w, http.StatusOK, GetRepoResponse{
		Repo:       *updatedConfig,
		InitScript: initScript,
	})
}

// handleRemoveRepo handles DELETE /repos/{name}.
func (s *Server) handleRemoveRepo(w http.ResponseWriter, r *http.Request) {
	repoName := r.PathValue("name")
	if repoName == "" {
		writeError(w, http.StatusBadRequest, "missing_name", "Repository name is required")
		return
	}

	// URL decode the name
	repoName = strings.ReplaceAll(repoName, "%2F", "/")

	if err := s.repoStore.Remove(repoName); err != nil {
		var notFound *repoconfig.NotFoundError
		if errors.As(err, &notFound) {
			writeError(w, http.StatusNotFound, "not_found", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "store_error", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": fmt.Sprintf("Repository '%s' removed", repoName),
	})
}

// Helper methods

// syncSessionsWithProvider updates session statuses from provider APIs.
func (s *Server) syncSessionsWithProvider(ctx context.Context, sessions []session.Session) []session.Session {
	if s.config == nil {
		return sessions
	}

	// Group sessions by provider
	byProvider := make(map[string][]int)
	for i, sess := range sessions {
		if sess.Provider != "" {
			byProvider[sess.Provider] = append(byProvider[sess.Provider], i)
		}
	}

	// Sync each provider
	for provName, indices := range byProvider {
		prov, err := provider.Get(provName, s.config)
		if err != nil {
			continue
		}

		vms, err := prov.List(ctx)
		if err != nil {
			continue
		}

		// Build a map of VM states by ID
		vmStates := make(map[string]*provider.VM)
		for _, vm := range vms {
			vmStates[vm.ID] = vm
		}

		// Update session statuses
		for _, i := range indices {
			sess := &sessions[i]
			if sess.ProviderID == "" {
				continue
			}

			if vm, exists := vmStates[sess.ProviderID]; exists {
				newStatus := mapVMStatusToSession(vm.Status)
				if newStatus != sess.Status {
					sessions[i].Status = newStatus
					s.sessionStore.Update(sess.ID, newStatus)
				}
				if vm.IPAddress != "" && vm.IPAddress != sess.IPAddress {
					sessions[i].IPAddress = vm.IPAddress
					s.sessionStore.UpdateSession(sessions[i])
				}
			} else if sess.Status.IsActive() {
				sessions[i].Status = session.StatusStopped
				s.sessionStore.Update(sess.ID, session.StatusStopped)
			}
		}
	}

	return sessions
}

// syncSessionWithProvider updates a single session status from provider API.
func (s *Server) syncSessionWithProvider(ctx context.Context, sess *session.Session) *session.Session {
	if s.config == nil || sess.Provider == "" || sess.ProviderID == "" {
		return sess
	}

	prov, err := provider.Get(sess.Provider, s.config)
	if err != nil {
		return sess
	}

	vm, err := prov.Get(ctx, sess.ProviderID)
	if err != nil {
		if sess.Status.IsActive() {
			sess.Status = session.StatusStopped
			s.sessionStore.Update(sess.ID, session.StatusStopped)
		}
		return sess
	}

	newStatus := mapVMStatusToSession(vm.Status)
	if newStatus != sess.Status {
		sess.Status = newStatus
		s.sessionStore.Update(sess.ID, newStatus)
	}
	if vm.IPAddress != "" && vm.IPAddress != sess.IPAddress {
		sess.IPAddress = vm.IPAddress
		s.sessionStore.UpdateSession(*sess)
	}

	return sess
}

// mapVMStatusToSession converts provider.VMStatus to session.Status.
func mapVMStatusToSession(status provider.VMStatus) session.Status {
	switch status {
	case provider.StatusRunning:
		return session.StatusRunning
	case provider.StatusProvisioning, provider.StatusStarting:
		return session.StatusProvisioning
	case provider.StatusStopped, provider.StatusStopping, provider.StatusDeleting:
		return session.StatusStopped
	case provider.StatusFailed:
		return session.StatusFailed
	default:
		return session.StatusProvisioning
	}
}

// ensureSSHKey makes sure the user's SSH key is uploaded to the provider.
func (s *Server) ensureSSHKey(ctx context.Context, prov provider.Provider) (string, error) {
	keyManager, ok := prov.(provider.SSHKeyManager)
	if !ok {
		return "", fmt.Errorf("provider %s does not support SSH key management", prov.Name())
	}

	if s.config == nil {
		return "", fmt.Errorf("configuration not loaded")
	}

	pubKeyPath := s.config.ExpandSSHPublicKeyPath()
	pubKeyData, err := os.ReadFile(pubKeyPath)
	if err != nil {
		return "", fmt.Errorf("failed to read SSH public key: %w", err)
	}

	keyName := fmt.Sprintf("sandctl-%s", hashPrefix(string(pubKeyData), 8))
	keyID, err := keyManager.EnsureSSHKey(ctx, keyName, string(pubKeyData))
	if err != nil {
		return "", err
	}

	return keyID, nil
}

// hashPrefix returns a prefix of the MD5 hash of the input string.
func hashPrefix(s string, n int) string {
	h := md5.Sum([]byte(s)) //nolint:gosec // Not used for security, just for unique naming
	hexStr := fmt.Sprintf("%x", h)
	if len(hexStr) > n {
		return hexStr[:n]
	}
	return hexStr
}

// getSSHPrivateKeyPath returns the path to the SSH private key.
func (s *Server) getSSHPrivateKeyPath() (string, error) {
	if s.config == nil {
		return "", fmt.Errorf("configuration not loaded")
	}

	pubKeyPath := s.config.ExpandSSHPublicKeyPath()
	if pubKeyPath == "" {
		return "", fmt.Errorf("ssh_public_key not configured")
	}

	privateKeyPath := strings.TrimSuffix(pubKeyPath, ".pub")
	return privateKeyPath, nil
}

// waitForCloudInit waits for cloud-init to complete.
func (s *Server) waitForCloudInit(ipAddress string, timeout time.Duration) error {
	privateKeyPath, err := s.getSSHPrivateKeyPath()
	if err != nil {
		return err
	}

	client, err := sshexec.NewClient(ipAddress, privateKeyPath)
	if err != nil {
		return err
	}
	defer client.Close()

	deadline := time.Now().Add(timeout)
	pollInterval := 5 * time.Second

	for time.Now().Before(deadline) {
		output, err := client.Exec("test -f /var/lib/cloud/instance/boot-finished && echo done")
		if err == nil && output == "done\n" {
			return nil
		}
		time.Sleep(pollInterval)
	}

	return fmt.Errorf("cloud-init did not complete within %v", timeout)
}

// setupOpenCode installs and configures OpenCode.
func (s *Server) setupOpenCode(ipAddress string) error {
	privateKeyPath, err := s.getSSHPrivateKeyPath()
	if err != nil {
		return err
	}

	client, err := sshexec.NewClient(ipAddress, privateKeyPath)
	if err != nil {
		return err
	}
	defer client.Close()

	// Install OpenCode
	installCmd := "curl -fsSL https://opencode.ai/install | bash"
	client.Exec(installCmd)

	// Create config directory
	client.Exec("mkdir -p ~/.local/share/opencode")

	// Write auth file
	if s.config != nil && s.config.OpencodeZenKey != "" {
		authJSON := fmt.Sprintf(`{"opencode":{"type":"api","key":"%s"}}`, s.config.OpencodeZenKey)
		writeCmd := fmt.Sprintf("echo '%s' > ~/.local/share/opencode/auth.json", authJSON)
		client.Exec(writeCmd)
	}

	return nil
}

// runInitScript uploads and executes a custom init script.
func (s *Server) runInitScript(ipAddress, repoPath, scriptContent string) error {
	privateKeyPath, err := s.getSSHPrivateKeyPath()
	if err != nil {
		return err
	}

	client, err := sshexec.NewClient(ipAddress, privateKeyPath)
	if err != nil {
		return err
	}
	defer client.Close()

	// Upload using base64
	encoded := make([]byte, len(scriptContent)*2)
	n := copy(encoded, scriptContent)
	uploadCmd := fmt.Sprintf("echo '%s' | base64 -d > /tmp/sandctl-init.sh && chmod +x /tmp/sandctl-init.sh", string(encoded[:n]))
	client.Exec(uploadCmd)

	// Execute
	execCmd := fmt.Sprintf("cd %s && /tmp/sandctl-init.sh", repoPath)
	client.Exec(execCmd)

	// Cleanup
	client.Exec("rm -f /tmp/sandctl-init.sh")

	return nil
}
