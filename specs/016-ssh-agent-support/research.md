# Research: SSH Agent Support

**Feature**: 016-ssh-agent-support
**Date**: 2026-01-26

## Overview

This document captures research findings for implementing SSH agent support in sandctl's `init` command, enabling users who manage SSH keys through external agents (1Password, ssh-agent, gpg-agent) to configure sandctl without requiring public key files on disk.

## Research Topics

### 1. Go SSH Agent Library (`golang.org/x/crypto/ssh/agent`)

**Decision**: Use the standard `golang.org/x/crypto/ssh/agent` package
**Rationale**: Already a transitive dependency via `golang.org/x/crypto/ssh`, well-maintained, implements the standard SSH agent protocol
**Alternatives considered**: None viable - this is the standard Go implementation

#### Key APIs

```go
// Connect to agent via Unix socket
conn, err := net.Dial("unix", socketPath)
agentClient := agent.NewClient(conn)

// List available keys
keys, err := agentClient.List() // Returns []*agent.Key

// agent.Key implements ssh.PublicKey interface
key.Type()                      // "ssh-ed25519", "ssh-rsa", etc.
key.String()                    // OpenSSH authorized_keys format
ssh.FingerprintSHA256(key)     // "SHA256:..." fingerprint
```

### 2. SSH Agent Socket Discovery

**Decision**: Check multiple socket locations in priority order
**Rationale**: Different SSH agents use different socket paths; users may have IdentityAgent configured in ~/.ssh/config

#### Socket Discovery Priority

1. **`~/.ssh/config` IdentityAgent directive** - User's explicit configuration (highest priority)
2. **1Password agent socket** - Common password manager with SSH agent
   - macOS: `~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock`
   - Linux: `~/.1password/agent.sock`
3. **`SSH_AUTH_SOCK` environment variable** - Standard system agent

**Note**: The existing `internal/sshexec/client.go` already implements this exact priority order in `findAllAgentSockets()`. We can reuse this logic.

### 3. Configuration Storage Strategy

**Decision**: Store both public key content (inline) and fingerprint
**Rationale**:
- Public key content is needed for VM provisioning (uploading to Hetzner)
- Fingerprint is needed for re-matching with agent at SSH connection time

#### Config Schema Changes

```yaml
# Existing approach (file path)
ssh_public_key: ~/.ssh/id_ed25519.pub

# New approach (agent mode)
ssh_key_source: agent                    # "file" or "agent"
ssh_public_key_inline: "ssh-ed25519 AAAA... comment"
ssh_key_fingerprint: "SHA256:abc123..."

# OR hybrid (file path still works for backward compatibility)
ssh_public_key: ~/.ssh/id_ed25519.pub    # file mode (default if present)
```

**Backward Compatibility**: If `ssh_public_key` is set and points to a valid file, use file mode. Otherwise, check for `ssh_key_source: agent`.

### 4. Interactive Key Selection

**Decision**: Show fingerprint and comment for each key; pre-select first key if only one available
**Rationale**: Fingerprint is standard identifier; comment usually contains meaningful info (email, description)

#### Display Format

```
Available SSH keys from agent:
  1) ED25519 SHA256:nThbg6k... (user@example.com)
  2) RSA-4096 SHA256:aBc123... (work-laptop)

Select key [1]:
```

### 5. Non-Interactive Mode Flags

**Decision**: Add `--ssh-agent` and `--ssh-key-fingerprint` flags
**Rationale**: Enables scripted/CI usage with explicit key selection

```bash
# Use first available key from agent
sandctl init --hetzner-token TOKEN --ssh-agent

# Use specific key by fingerprint
sandctl init --hetzner-token TOKEN --ssh-agent --ssh-key-fingerprint "SHA256:abc..."
```

### 6. Error Handling Strategy

**Decision**: Provide specific, actionable error messages for each failure mode
**Rationale**: Users need to understand why agent access failed and how to fix it

| Error Condition | Message |
|----------------|---------|
| SSH_AUTH_SOCK not set | "No SSH agent found. Set SSH_AUTH_SOCK or configure IdentityAgent in ~/.ssh/config" |
| Socket doesn't exist | "SSH agent socket not found at {path}. Is your SSH agent running?" |
| Connection refused | "Cannot connect to SSH agent. The agent may have stopped." |
| No keys in agent | "SSH agent has no keys loaded. Run 'ssh-add' to add keys, or use --ssh-public-key for a file path." |
| Fingerprint not found | "Key with fingerprint {fp} not found in agent. Available keys: ..." |

### 7. Key Validation (Sign Test)

**Decision**: Validate keys can sign (not just be listed) during init
**Rationale**: Some agent configurations may allow listing but not signing; better to fail early

```go
// Test that the key can actually sign
signer, err := agentClient.Signers()
// If signers returns the key, it can sign
```

### 8. Existing Code Reuse

**Reusable from `internal/sshexec/client.go`**:
- `findAllAgentSockets()` - Socket discovery with priority order
- `getIdentityAgentFromConfig()` - Parse ~/.ssh/config for IdentityAgent
- `tryAgentSocket()` - Connect to a specific socket

**New code needed**:
- Key listing and display for interactive selection
- Config file schema changes
- Init command flow changes
- CLI flag handling

## Implementation Approach

1. **Create `internal/sshagent/` package** - Extract and extend agent discovery from sshexec
2. **Modify `internal/config/config.go`** - Add new fields, update validation
3. **Modify `internal/cli/init.go`** - Add interactive agent flow and new flags
4. **Update `internal/cli/new.go`** - Handle both file and inline public key sources

## References

- [golang.org/x/crypto/ssh/agent](https://pkg.go.dev/golang.org/x/crypto/ssh/agent)
- [1Password SSH Agent Documentation](https://developer.1password.com/docs/ssh/agent/)
- [OpenSSH ssh_config(5) - IdentityAgent](https://man.openbsd.org/ssh_config#IdentityAgent)
