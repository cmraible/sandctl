# Data Model: SSH Agent Support

**Feature**: 016-ssh-agent-support
**Date**: 2026-01-26

## Entities

### 1. Config (modified)

**File**: `internal/config/config.go`

**Purpose**: Extended configuration structure to support both file-based and agent-based SSH key sources.

```go
// Config represents the sandctl configuration.
type Config struct {
    // Provider configuration
    DefaultProvider string                    `yaml:"default_provider,omitempty"`
    Providers       map[string]ProviderConfig `yaml:"providers,omitempty"`

    // SSH key configuration (mutual exclusivity enforced at validation)
    SSHPublicKey       string `yaml:"ssh_public_key,omitempty"`        // File path mode (existing)
    SSHKeySource       string `yaml:"ssh_key_source,omitempty"`        // "file" or "agent"
    SSHPublicKeyInline string `yaml:"ssh_public_key_inline,omitempty"` // Agent mode: full public key
    SSHKeyFingerprint  string `yaml:"ssh_key_fingerprint,omitempty"`   // Agent mode: SHA256 fingerprint

    // Legacy fields
    SpritesToken   string `yaml:"sprites_token,omitempty"`
    OpencodeZenKey string `yaml:"opencode_zen_key,omitempty"`
}
```

**Field Descriptions**:

| Field | Type | Description |
|-------|------|-------------|
| `ssh_key_source` | string | Key source: `"file"` or `"agent"`. Defaults to `"file"` if `ssh_public_key` is set. |
| `ssh_public_key` | string | Path to public key file (e.g., `~/.ssh/id_ed25519.pub`). Used when source is `"file"`. |
| `ssh_public_key_inline` | string | Complete public key in OpenSSH format. Used when source is `"agent"`. |
| `ssh_key_fingerprint` | string | SHA256 fingerprint (e.g., `SHA256:abc...`). Used for agent key re-matching. |

**Validation Rules**:

1. One of `ssh_public_key` OR `ssh_public_key_inline` must be set
2. If `ssh_key_source` is `"agent"`, both `ssh_public_key_inline` and `ssh_key_fingerprint` must be set
3. If `ssh_key_source` is `"file"` or empty, `ssh_public_key` must point to an existing file
4. Fingerprint format must match `SHA256:...` pattern

### 2. AgentKey (new)

**File**: `internal/sshagent/agent.go`

**Purpose**: Represents an SSH key retrieved from the SSH agent.

```go
// AgentKey represents a key from the SSH agent with display-friendly fields.
type AgentKey struct {
    Type        string // Key algorithm (e.g., "ED25519", "RSA-4096")
    Fingerprint string // SHA256 fingerprint (e.g., "SHA256:abc...")
    Comment     string // Key comment (usually email or description)
    PublicKey   string // Full public key in OpenSSH authorized_keys format
}
```

**Methods**:

```go
// DisplayString returns a human-readable representation for interactive selection.
func (k *AgentKey) DisplayString() string {
    return fmt.Sprintf("%s %s (%s)", k.Type, k.Fingerprint, k.Comment)
}
```

### 3. Agent (new)

**File**: `internal/sshagent/agent.go`

**Purpose**: Handles SSH agent discovery and key listing.

```go
// Agent provides access to SSH agent keys.
type Agent struct {
    conn   net.Conn
    client agent.ExtendedAgent
}

// Discovery returns available agent sockets in priority order.
func Discovery() []string

// New connects to the first available SSH agent.
func New() (*Agent, error)

// NewFromSocket connects to a specific agent socket.
func NewFromSocket(socketPath string) (*Agent, error)

// ListKeys returns all keys available in the agent.
func (a *Agent) ListKeys() ([]AgentKey, error)

// GetKeyByFingerprint returns the key matching the given fingerprint.
func (a *Agent) GetKeyByFingerprint(fingerprint string) (*AgentKey, error)

// Close closes the agent connection.
func (a *Agent) Close() error
```

## State Transitions

### Configuration Modes

```
┌─────────────────────────────────────────────────────────────────────┐
│                        sandctl init                                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────────┐
              │ Auto-detect SSH agent available? │
              └───────────────────────────────────┘
                    │                    │
                   Yes                   No
                    │                    │
                    ▼                    ▼
         ┌─────────────────┐    ┌─────────────────┐
         │  SSH Agent Mode │    │   File Mode     │
         │ (pre-selected)  │    │  (default)      │
         └─────────────────┘    └─────────────────┘
                    │                    │
                    ▼                    ▼
         ┌─────────────────┐    ┌─────────────────┐
         │  Select key     │    │  Enter file     │
         │  from agent     │    │  path           │
         └─────────────────┘    └─────────────────┘
                    │                    │
                    ▼                    ▼
         ┌─────────────────┐    ┌─────────────────┐
         │  Store:         │    │  Store:         │
         │  - inline key   │    │  - file path    │
         │  - fingerprint  │    │                 │
         │  - source:agent │    │  (source:file)  │
         └─────────────────┘    └─────────────────┘
```

## Example Configurations

### File Mode (existing behavior)

```yaml
default_provider: hetzner
ssh_public_key: ~/.ssh/id_ed25519.pub

providers:
  hetzner:
    token: "hcloud-xxx"
    region: ash
    server_type: cpx31
    image: ubuntu-24.04
```

### Agent Mode (new)

```yaml
default_provider: hetzner
ssh_key_source: agent
ssh_public_key_inline: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJxQw2mX... user@example.com"
ssh_key_fingerprint: "SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8"

providers:
  hetzner:
    token: "hcloud-xxx"
    region: ash
    server_type: cpx31
    image: ubuntu-24.04
```

### Hybrid (file path present but agent mode explicitly set)

```yaml
default_provider: hetzner
ssh_key_source: agent
ssh_public_key_inline: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... user@example.com"
ssh_key_fingerprint: "SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8"
ssh_public_key: ~/.ssh/id_ed25519.pub  # Ignored when source is "agent"

providers:
  hetzner:
    token: "hcloud-xxx"
```

## Backward Compatibility

1. **Existing configs with `ssh_public_key`**: Continue to work unchanged (implicit `source: file`)
2. **New `ssh_key_source: agent`**: Explicitly triggers agent mode
3. **Validation**: Warns if conflicting settings but prioritizes explicit `ssh_key_source`
