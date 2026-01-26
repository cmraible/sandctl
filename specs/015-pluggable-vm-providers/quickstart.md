# Quickstart: Pluggable VM Providers

**Feature**: 015-pluggable-vm-providers
**Date**: 2026-01-25

## Prerequisites

1. **Hetzner Cloud Account**: Sign up at https://console.hetzner.cloud
2. **Hetzner API Token**: Generate at Console → Your Project → Security → API Tokens
   - Select "Read & Write" permissions
3. **SSH Key Pair**: Existing key at `~/.ssh/id_ed25519` or similar

## Quick Setup

### 1. Install sandctl

```bash
go install github.com/sandctl/sandctl@latest
```

### 2. Initialize Configuration

```bash
sandctl init
```

You'll be prompted for:
- **Default provider**: `hetzner` (only option initially)
- **Hetzner API token**: Your 64-character token
- **SSH public key path**: e.g., `~/.ssh/id_ed25519.pub`
- **Default region**: `ash` (Ashburn, VA) recommended for US users
- **Default server type**: `cpx31` (4 vCPU, 8GB RAM)

### 3. Create Your First Sandbox

```bash
sandctl new
```

This will:
1. Create a Hetzner Cloud server with Ubuntu 24.04
2. Install Docker, Git, Node.js, and Python
3. Open an interactive terminal session

### 4. Clone a Repository (Optional)

```bash
sandctl new --repo github.com/your-org/your-repo
```

## Common Commands

| Command | Description |
|---------|-------------|
| `sandctl new` | Create new sandbox VM |
| `sandctl new --repo <url>` | Create sandbox and clone repo |
| `sandctl list` | List all active sandboxes |
| `sandctl console <name>` | Open terminal to sandbox |
| `sandctl exec <name> <cmd>` | Run command in sandbox |
| `sandctl destroy <name>` | Terminate sandbox |

## Configuration Reference

Config file: `~/.sandctl/config`

```yaml
# Required: which provider to use by default
default_provider: hetzner

# Required: path to your SSH public key
ssh_public_key: ~/.ssh/id_ed25519.pub

# Optional: OpenCode integration
opencode_zen_key: "your-opencode-key"

# Provider configurations
providers:
  hetzner:
    # Required: your Hetzner Cloud API token
    token: "your-64-char-token"

    # Optional: datacenter region
    # Options: ash (Virginia), hel1 (Helsinki), fsn1 (Germany), nbg1 (Germany)
    region: ash

    # Optional: server hardware type
    # Options: cpx21, cpx31, cpx41, cpx51 (AMD), cx22, cx32, cx42, cx52 (shared)
    server_type: cpx31

    # Optional: OS image
    # Options: ubuntu-24.04, ubuntu-22.04, debian-12
    image: ubuntu-24.04
```

## Overriding Defaults

### Per-Command Provider

```bash
# Use GCP instead of default (when GCP provider is implemented)
sandctl new --provider gcp
```

### Per-Command Region

```bash
# Create in Helsinki instead of default Ashburn
sandctl new --region hel1
```

## Troubleshooting

### "authentication failed"

Your Hetzner API token is invalid or expired. Generate a new token at:
https://console.hetzner.cloud → Security → API Tokens

```bash
sandctl init  # Re-run to update token
```

### "quota exceeded"

You've hit Hetzner's server limit. Options:
1. Destroy unused sandboxes: `sandctl destroy <name>`
2. Request quota increase in Hetzner Console

### "SSH connection refused"

The VM may still be booting. Wait 1-2 minutes and try again:
```bash
sandctl console <name>
```

### Old sessions showing errors

If upgrading from sprites-based version:
1. Sessions from old version are incompatible
2. Run `sandctl list` to clean up invalid entries
3. Manually destroy old sprites at https://sprites.dev

## Cost Awareness

Hetzner VMs are billed hourly. Approximate costs:
- CPX31 (4 vCPU, 8GB): ~€0.02/hour (~€15/month)
- CPX21 (3 vCPU, 4GB): ~€0.01/hour (~€8/month)

**Always destroy unused sandboxes** to avoid charges:
```bash
sandctl destroy <name>
# or destroy all
sandctl list --format=name | xargs -I{} sandctl destroy {}
```
