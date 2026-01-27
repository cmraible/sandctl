// Package sshexec provides SSH-based command execution and console access.
package sshexec

import (
	"fmt"
	"net"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

const (
	defaultSSHPort    = 22
	defaultSSHUser    = "agent"
	defaultSSHTimeout = 30 * time.Second
)

// Client wraps an SSH connection for command execution.
type Client struct {
	host      string
	port      int
	user      string
	signer    ssh.Signer
	timeout   time.Duration
	sshClient *ssh.Client
	connected bool
}

// ClientOption configures a Client.
type ClientOption func(*Client)

// WithPort sets the SSH port (default: 22).
func WithPort(port int) ClientOption {
	return func(c *Client) {
		c.port = port
	}
}

// WithUser sets the SSH user (default: root).
func WithUser(user string) ClientOption {
	return func(c *Client) {
		c.user = user
	}
}

// WithTimeout sets the connection timeout (default: 30s).
func WithTimeout(timeout time.Duration) ClientOption {
	return func(c *Client) {
		c.timeout = timeout
	}
}

// NewClient creates a new SSH client for the given host.
// The privateKeyPath should point to the private key file (not the .pub file).
// If the key is passphrase-protected, it will try to use ssh-agent.
func NewClient(host, privateKeyPath string, opts ...ClientOption) (*Client, error) {
	// Try ssh-agent first (handles passphrase-protected keys)
	signer, err := getSignerFromAgent(privateKeyPath)
	if err != nil {
		// Fall back to direct key parsing (works for unencrypted keys)
		signer, err = getSignerFromFile(privateKeyPath)
		if err != nil {
			// Check if it's a passphrase error and give helpful message
			if strings.Contains(err.Error(), "passphrase") {
				return nil, fmt.Errorf("SSH key is passphrase-protected. Please add it to ssh-agent: ssh-add %s", privateKeyPath)
			}
			return nil, err
		}
	}

	c := &Client{
		host:    host,
		port:    defaultSSHPort,
		user:    defaultSSHUser,
		signer:  signer,
		timeout: defaultSSHTimeout,
	}

	for _, opt := range opts {
		opt(c)
	}

	return c, nil
}

// getSignerFromAgent tries to get a signer from ssh-agent that matches the given key file.
func getSignerFromAgent(privateKeyPath string) (ssh.Signer, error) {
	// Try all possible agent sockets until one has keys
	sockets := findAllAgentSockets()
	if len(sockets) == 0 {
		return nil, fmt.Errorf("no SSH agent found")
	}

	for _, agentSocket := range sockets {
		signer, err := tryAgentSocket(agentSocket, privateKeyPath)
		if err == nil {
			return signer, nil
		}
	}

	return nil, fmt.Errorf("no keys found in any SSH agent")
}

// tryAgentSocket attempts to get a signer from a specific agent socket.
func tryAgentSocket(agentSocket, privateKeyPath string) (ssh.Signer, error) {
	conn, err := net.Dial("unix", agentSocket)
	if err != nil {
		return nil, err
	}

	agentClient := agent.NewClient(conn)

	// Get all signers from agent
	signers, err := agentClient.Signers()
	if err != nil {
		conn.Close()
		return nil, err
	}

	if len(signers) == 0 {
		conn.Close()
		return nil, fmt.Errorf("no keys in agent")
	}

	// Try to match with the public key file
	pubKeyPath := privateKeyPath + ".pub"
	pubKeyData, err := os.ReadFile(pubKeyPath)
	if err == nil {
		// Parse the public key to get its fingerprint
		pubKey, _, _, _, err := ssh.ParseAuthorizedKey(pubKeyData)
		if err == nil {
			// Find matching signer in agent
			for _, signer := range signers {
				if string(signer.PublicKey().Marshal()) == string(pubKey.Marshal()) {
					return signer, nil
				}
			}
		}
	}

	// If we couldn't match, just use the first signer
	// (common case: user has one key loaded)
	return signers[0], nil
}

// findAllAgentSockets returns all possible SSH agent sockets to try, in priority order.
func findAllAgentSockets() []string {
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

	// 2. Check common 1Password socket path
	if home, err := os.UserHomeDir(); err == nil {
		addSocket(home + "/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock")
	}

	// 3. Check SSH_AUTH_SOCK environment variable (system agent, often empty)
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
			agent := strings.TrimSpace(line[14:])
			// Remove quotes if present
			agent = strings.Trim(agent, "\"'")
			// Expand ~ to home directory
			if strings.HasPrefix(agent, "~/") {
				agent = home + agent[1:]
			}
			// Verify socket exists
			if _, err := os.Stat(agent); err == nil {
				return agent
			}
		}
	}

	return ""
}

// getSignerFromFile parses a private key file directly.
func getSignerFromFile(privateKeyPath string) (ssh.Signer, error) {
	keyData, err := os.ReadFile(privateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read SSH private key: %w", err)
	}

	signer, err := ssh.ParsePrivateKey(keyData)
	if err != nil {
		return nil, fmt.Errorf("failed to parse SSH private key: %w", err)
	}

	return signer, nil
}

// NewClientWithSigner creates a new SSH client with a pre-parsed signer.
func NewClientWithSigner(host string, signer ssh.Signer, opts ...ClientOption) *Client {
	c := &Client{
		host:    host,
		port:    defaultSSHPort,
		user:    defaultSSHUser,
		signer:  signer,
		timeout: defaultSSHTimeout,
	}

	for _, opt := range opts {
		opt(c)
	}

	return c
}

// Connect establishes the SSH connection.
func (c *Client) Connect() error {
	if c.connected {
		return nil
	}

	config := &ssh.ClientConfig{
		User: c.user,
		Auth: []ssh.AuthMethod{
			ssh.PublicKeys(c.signer),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), //nolint:gosec // VMs are ephemeral, host keys unknown
		Timeout:         c.timeout,
	}

	addr := fmt.Sprintf("%s:%d", c.host, c.port)
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", addr, err)
	}

	c.sshClient = client
	c.connected = true
	return nil
}

// Close closes the SSH connection.
func (c *Client) Close() error {
	if c.sshClient != nil {
		err := c.sshClient.Close()
		c.sshClient = nil
		c.connected = false
		return err
	}
	return nil
}

// IsConnected returns true if the client has an active connection.
func (c *Client) IsConnected() bool {
	return c.connected && c.sshClient != nil
}

// getSession creates a new SSH session, connecting if necessary.
func (c *Client) getSession() (*ssh.Session, error) {
	if err := c.Connect(); err != nil {
		return nil, err
	}

	session, err := c.sshClient.NewSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create SSH session: %w", err)
	}

	return session, nil
}

// CheckConnection tests if SSH is accepting connections.
// This is useful for polling until a VM is ready.
func CheckConnection(host string, port int, timeout time.Duration) bool {
	addr := net.JoinHostPort(host, fmt.Sprintf("%d", port))
	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}
