# Quickstart: SSH Agent Support

**Feature**: 016-ssh-agent-support
**Date**: 2026-01-26

## Overview

This feature enables sandctl to use SSH keys managed by external SSH agents (1Password, ssh-agent, gpg-agent) during initialization, eliminating the requirement for public key files stored on disk.

## Prerequisites

- sandctl installed
- SSH agent running with at least one key loaded
  - **1Password**: Enable SSH Agent in Settings > Developer
  - **ssh-agent**: Run `ssh-add ~/.ssh/id_ed25519`
  - **gpg-agent**: Configure `enable-ssh-support`

## Usage

### Interactive Mode (Recommended)

```bash
sandctl init
```

When an SSH agent is detected, you'll see:

```
sandctl Configuration
=====================

SSH key source:
  1) SSH Agent (recommended) - 2 keys available
  2) File path - specify path to public key file

Select [1]:
```

If you select SSH Agent and have multiple keys:

```
Available SSH keys from agent:
  1) ED25519 SHA256:nThbg6k... (user@example.com)
  2) RSA-4096 SHA256:aBc123... (work-laptop)

Select key [1]:
```

### Non-Interactive Mode (CI/Scripts)

```bash
# Use first available key from SSH agent
sandctl init --hetzner-token "$HETZNER_TOKEN" --ssh-agent

# Use specific key by fingerprint
sandctl init --hetzner-token "$HETZNER_TOKEN" --ssh-agent \
  --ssh-key-fingerprint "SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8"
```

### Traditional File Path Mode

The existing file path mode continues to work:

```bash
# Interactive
sandctl init
# Select "File path" option, enter: ~/.ssh/id_ed25519.pub

# Non-interactive
sandctl init --hetzner-token "$HETZNER_TOKEN" --ssh-public-key ~/.ssh/id_ed25519.pub
```

## Verification

After configuration, verify your setup:

```bash
# Check config file
cat ~/.sandctl/config

# For agent mode, you should see:
# ssh_key_source: agent
# ssh_public_key_inline: "ssh-ed25519 AAAA..."
# ssh_key_fingerprint: "SHA256:..."

# Create a test session
sandctl new --no-console
sandctl list
sandctl destroy <session-name>
```

## Troubleshooting

### "No SSH agent found"

**Cause**: SSH_AUTH_SOCK not set and no known agent sockets found.

**Solutions**:
- Start your SSH agent: `eval $(ssh-agent)`
- For 1Password: Enable SSH Agent in Settings > Developer
- Set SSH_AUTH_SOCK manually: `export SSH_AUTH_SOCK=/path/to/socket`

### "SSH agent has no keys loaded"

**Cause**: Agent is running but no keys are added.

**Solutions**:
- Add keys to ssh-agent: `ssh-add ~/.ssh/id_ed25519`
- For 1Password: Ensure keys are enabled for SSH agent in 1Password
- Check loaded keys: `ssh-add -l`

### "Key with fingerprint X not found"

**Cause**: The configured key fingerprint doesn't match any key in the agent.

**Solutions**:
- List available keys: `ssh-add -l`
- Re-run `sandctl init` to select a different key
- Ensure the correct key is loaded in your agent

### Agent Works for Init but SSH Connection Fails

**Cause**: Agent may have become unavailable after init.

**Solutions**:
- Verify agent is running: `ssh-add -l`
- For 1Password: Check 1Password is unlocked
- Re-run `sandctl init` if the key changed
