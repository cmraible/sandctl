# Quickstart: Sandbox Git Configuration

**Feature**: 019-sandbox-git-config
**Date**: 2026-01-27

## Overview

This feature enables AI agents running in sandctl sandboxes to:
1. Make git commits with proper author information
2. Push to remote repositories (using existing SSH agent forwarding)
3. Create pull requests using GitHub CLI

## Prerequisites

- sandctl installed and configured with Hetzner Cloud
- SSH agent with key loaded (for sandbox access)
- For PR creation: GitHub personal access token with `repo` scope

## Setup

### Option 1: Use Your Existing Git Config (Recommended)

If you already have `~/.gitconfig` configured on your machine:

```bash
# Re-run init to add git configuration
sandctl init

# Interactive prompts will detect your existing gitconfig
# and offer to use it:
#
# Detected existing git config:
#   Name:  John Doe
#   Email: john@example.com
#   Path:  ~/.gitconfig
#
# Use this configuration? [Y/n]: y
```

### Option 2: Enter Git Config Manually

If you don't have a gitconfig or want different values for sandboxes:

```bash
sandctl init

# When prompted:
# Git user name (press Enter to skip): Jane Smith
# Git user email (press Enter to skip): jane@example.com
```

### Option 3: Non-Interactive Setup

```bash
# With existing gitconfig file
sandctl init --hetzner-token $HETZNER_TOKEN --ssh-agent --git-config-path ~/.gitconfig

# With manual values
sandctl init --hetzner-token $HETZNER_TOKEN --ssh-agent \
  --git-user-name "Jane Smith" \
  --git-user-email "jane@example.com"
```

## Adding GitHub Token (Optional)

To enable pull request creation from sandboxes:

1. Create a GitHub Personal Access Token at https://github.com/settings/tokens
2. Required scopes: `repo` (for private repos) or `public_repo` (for public only)
3. Add during init:

```bash
sandctl init
# ... other prompts ...
# GitHub personal access token (press Enter to skip): <paste token>
```

Or non-interactively:

```bash
sandctl init --hetzner-token $HETZNER_TOKEN --ssh-agent \
  --git-config-path ~/.gitconfig \
  --github-token $GITHUB_TOKEN
```

## Usage

### Creating a Sandbox

```bash
sandctl new
```

If git config is not set, you'll see a warning:
```
Warning: Git configuration not found. Commits in sandbox will require manual git config.
```

### In the Sandbox

Once connected to the sandbox, git is ready to use:

```bash
# Check git config
git config --global user.name   # Shows your name
git config --global user.email  # Shows your email

# Make commits
echo "Hello" > README.md
git add README.md
git commit -m "Initial commit"

# Push (requires SSH agent forwarding - enabled by default)
git push origin main
```

### Creating Pull Requests

If GitHub token was configured:

```bash
# Check authentication status
gh auth status

# Create a pull request
gh pr create --title "My feature" --body "Description of changes"
```

## Troubleshooting

### Git commit fails with "Please tell me who you are"

Git config was not set during init. Either:
- Re-run `sandctl init` to add git config
- Manually configure in sandbox: `git config --global user.name "Your Name"`

### gh auth status shows "not logged into github.com"

GitHub token was not configured. Either:
- Re-run `sandctl init` to add GitHub token
- Manually authenticate in sandbox: `echo $TOKEN | gh auth login --with-token`

### git push fails with "Permission denied"

SSH agent forwarding may not be working. Check:
1. SSH agent is running locally: `ssh-add -l`
2. SSH key has access to the repository

## Configuration Reference

After running `sandctl init`, your `~/.sandctl/config` may contain:

```yaml
default_provider: hetzner
ssh_key_source: agent
ssh_public_key_inline: "ssh-ed25519 AAAA..."
ssh_key_fingerprint: "SHA256:..."

# Git config (one of):
git_config_path: ~/.gitconfig           # Copies entire file
# OR
git_user_name: "John Doe"               # Generates minimal config
git_user_email: "john@example.com"

# GitHub (optional)
github_token: "ghp_..."

providers:
  hetzner:
    token: "..."
    region: ash
    server_type: cpx31
    image: ubuntu-24.04
```
