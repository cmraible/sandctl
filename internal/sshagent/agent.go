// Package sshagent provides SSH agent discovery and key listing functionality.
package sshagent

import (
	"errors"
	"fmt"
	"net"
	"os"
	"strings"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

// Error types for specific SSH agent error conditions.
var (
	// ErrNoAgentFound is returned when no SSH agent socket can be found.
	ErrNoAgentFound = errors.New("no SSH agent found. Set SSH_AUTH_SOCK or configure IdentityAgent in ~/.ssh/config")

	// ErrSocketNotFound is returned when a specific socket path doesn't exist.
	ErrSocketNotFound = errors.New("SSH agent socket not found")

	// ErrConnectionFailed is returned when connecting to the agent fails.
	ErrConnectionFailed = errors.New("cannot connect to SSH agent. The agent may have stopped")

	// ErrNoKeys is returned when the agent has no keys loaded.
	ErrNoKeys = errors.New("SSH agent has no keys loaded. Run 'ssh-add' to add keys, or use --ssh-public-key for a file path")
)

// AgentKey represents a key from the SSH agent with display-friendly fields.
type AgentKey struct {
	Type        string // Key algorithm (e.g., "ED25519", "RSA-4096")
	Fingerprint string // SHA256 fingerprint (e.g., "SHA256:abc...")
	Comment     string // Key comment (usually email or description)
	PublicKey   string // Full public key in OpenSSH authorized_keys format
}

// DisplayString returns a human-readable representation for interactive selection.
func (k *AgentKey) DisplayString() string {
	if k.Comment != "" {
		return fmt.Sprintf("%s %s (%s)", k.Type, k.Fingerprint, k.Comment)
	}
	return fmt.Sprintf("%s %s", k.Type, k.Fingerprint)
}

// Agent provides access to SSH agent keys.
type Agent struct {
	conn   net.Conn
	client agent.ExtendedAgent
}

// Discovery returns available agent sockets in priority order.
// Priority: 1) ~/.ssh/config IdentityAgent, 2) 1Password socket, 3) SSH_AUTH_SOCK
func Discovery() []string {
	var sockets []string
	seen := make(map[string]bool)

	addSocket := func(sock string) {
		if sock != "" && !seen[sock] {
			if _, err := os.Stat(sock); err == nil {
				sockets = append(sockets, sock)
				seen[sock] = true
			}
		}
	}

	// 1. Check ~/.ssh/config for IdentityAgent (highest priority - user's explicit config)
	addSocket(getIdentityAgentFromConfig())

	// 2. Check common 1Password socket paths
	if home, err := os.UserHomeDir(); err == nil {
		// macOS 1Password
		addSocket(home + "/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock")
		// Linux 1Password
		addSocket(home + "/.1password/agent.sock")
	}

	// 3. Check SSH_AUTH_SOCK environment variable (system agent)
	addSocket(os.Getenv("SSH_AUTH_SOCK"))

	return sockets
}

// getIdentityAgentFromConfig parses ~/.ssh/config for IdentityAgent directive.
func getIdentityAgentFromConfig() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	configPath := home + "/.ssh/config"
	data, err := os.ReadFile(configPath)
	if err != nil {
		return ""
	}

	// Simple parsing - look for IdentityAgent in Host * block or global
	lines := strings.Split(string(data), "\n")
	inGlobalOrWildcard := true // Start assuming global context

	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Skip comments and empty lines
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Check for Host directive
		if strings.HasPrefix(strings.ToLower(line), "host ") {
			hostPattern := strings.TrimSpace(line[5:])
			inGlobalOrWildcard = hostPattern == "*"
			continue
		}

		// Look for IdentityAgent in global context or Host *
		if inGlobalOrWildcard && strings.HasPrefix(strings.ToLower(line), "identityagent ") {
			agentPath := strings.TrimSpace(line[14:])
			// Remove quotes if present
			agentPath = strings.Trim(agentPath, "\"'")
			// Expand ~ to home directory
			if strings.HasPrefix(agentPath, "~/") {
				agentPath = home + agentPath[1:]
			}
			return agentPath
		}
	}

	return ""
}

// New connects to the first available SSH agent.
// Returns ErrNoAgentFound if no agent sockets are available.
func New() (*Agent, error) {
	sockets := Discovery()
	if len(sockets) == 0 {
		return nil, ErrNoAgentFound
	}

	// Try each socket until one works
	var lastErr error
	for _, sock := range sockets {
		a, err := NewFromSocket(sock)
		if err == nil {
			return a, nil
		}
		lastErr = err
	}

	if lastErr != nil {
		return nil, lastErr
	}
	return nil, ErrNoAgentFound
}

// NewFromSocket connects to a specific agent socket.
// Returns ErrSocketNotFound if the socket doesn't exist,
// or ErrConnectionFailed if connection fails.
func NewFromSocket(socketPath string) (*Agent, error) {
	// Check if socket exists
	if _, err := os.Stat(socketPath); err != nil {
		return nil, fmt.Errorf("%w at %s. Is your SSH agent running?", ErrSocketNotFound, socketPath)
	}

	// Connect to the socket
	conn, err := net.Dial("unix", socketPath)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrConnectionFailed, err)
	}

	client := agent.NewClient(conn)

	return &Agent{
		conn:   conn,
		client: client,
	}, nil
}

// ListKeys returns all keys available in the agent.
// Returns ErrNoKeys if the agent has no keys loaded.
func (a *Agent) ListKeys() ([]AgentKey, error) {
	keys, err := a.client.List()
	if err != nil {
		return nil, fmt.Errorf("failed to list keys from agent: %w", err)
	}

	if len(keys) == 0 {
		return nil, ErrNoKeys
	}

	result := make([]AgentKey, 0, len(keys))
	for _, key := range keys {
		result = append(result, AgentKey{
			Type:        formatKeyType(key.Type()),
			Fingerprint: ssh.FingerprintSHA256(key),
			Comment:     key.Comment,
			PublicKey:   string(ssh.MarshalAuthorizedKey(key)),
		})
	}

	return result, nil
}

// GetKeyByFingerprint returns the key matching the given fingerprint.
// The fingerprint should be in the format "SHA256:xxx..." or just the hash portion.
func (a *Agent) GetKeyByFingerprint(fingerprint string) (*AgentKey, error) {
	keys, err := a.ListKeys()
	if err != nil {
		return nil, err
	}

	// Normalize fingerprint - ensure it has SHA256: prefix
	if !strings.HasPrefix(fingerprint, "SHA256:") {
		fingerprint = "SHA256:" + fingerprint
	}

	for _, key := range keys {
		if key.Fingerprint == fingerprint {
			return &key, nil
		}
	}

	// Build helpful error message with available keys
	var available []string
	for _, key := range keys {
		available = append(available, fmt.Sprintf("  %s", key.DisplayString()))
	}

	return nil, fmt.Errorf("key with fingerprint %s not found in agent. Available keys:\n%s",
		fingerprint, strings.Join(available, "\n"))
}

// Close closes the agent connection.
func (a *Agent) Close() error {
	if a.conn != nil {
		return a.conn.Close()
	}
	return nil
}

// formatKeyType converts SSH key type to human-readable format.
func formatKeyType(keyType string) string {
	switch keyType {
	case "ssh-ed25519":
		return "ED25519"
	case "ssh-rsa":
		return "RSA"
	case "ecdsa-sha2-nistp256":
		return "ECDSA-256"
	case "ecdsa-sha2-nistp384":
		return "ECDSA-384"
	case "ecdsa-sha2-nistp521":
		return "ECDSA-521"
	default:
		return strings.ToUpper(strings.TrimPrefix(keyType, "ssh-"))
	}
}

// IsAvailable returns true if an SSH agent is available and has keys.
func IsAvailable() bool {
	a, err := New()
	if err != nil {
		return false
	}
	defer a.Close()

	keys, err := a.ListKeys()
	return err == nil && len(keys) > 0
}

// GetSignerByFingerprint returns an ssh.Signer for the key with the given fingerprint.
// This can be used to create SSH connections using the agent key.
// Note: The agent connection is kept open because the signer depends on it for signing operations.
func GetSignerByFingerprint(fingerprint string) (ssh.Signer, error) {
	// Connect to the agent - we intentionally don't close this connection
	// because the returned signer needs it to perform signing operations.
	// The connection will be closed when the process exits.
	sockets := Discovery()
	if len(sockets) == 0 {
		return nil, ErrNoAgentFound
	}

	var lastErr error
	for _, sock := range sockets {
		conn, err := net.Dial("unix", sock)
		if err != nil {
			lastErr = err
			continue
		}

		agentClient := agent.NewClient(conn)

		// Normalize fingerprint
		fp := fingerprint
		if !strings.HasPrefix(fp, "SHA256:") {
			fp = "SHA256:" + fp
		}

		// Get signers from agent
		signers, err := agentClient.Signers()
		if err != nil {
			conn.Close()
			lastErr = err
			continue
		}

		if len(signers) == 0 {
			conn.Close()
			lastErr = ErrNoKeys
			continue
		}

		// Find signer by fingerprint
		for _, signer := range signers {
			if ssh.FingerprintSHA256(signer.PublicKey()) == fp {
				// Don't close conn - the signer needs it!
				return signer, nil
			}
		}

		// Key not found in this agent, try next
		conn.Close()
	}

	// Build helpful error message with available keys
	if a, err := New(); err == nil {
		defer a.Close()
		if signers, err := a.client.Signers(); err == nil && len(signers) > 0 {
			var available []string
			for _, signer := range signers {
				fp := ssh.FingerprintSHA256(signer.PublicKey())
				available = append(available, fmt.Sprintf("  %s", fp))
			}
			return nil, fmt.Errorf("key with fingerprint %s not found in agent. Available keys:\n%s",
				fingerprint, strings.Join(available, "\n"))
		}
	}

	if lastErr != nil {
		return nil, lastErr
	}
	return nil, ErrNoAgentFound
}

// KeyCount returns the number of keys available in the SSH agent.
// Returns 0 if no agent is available or if an error occurs.
func KeyCount() int {
	a, err := New()
	if err != nil {
		return 0
	}
	defer a.Close()

	keys, err := a.ListKeys()
	if err != nil {
		return 0
	}
	return len(keys)
}
