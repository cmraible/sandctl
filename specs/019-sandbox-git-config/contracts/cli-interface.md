# CLI Interface Contract: Sandbox Git Configuration

**Feature**: 019-sandbox-git-config
**Date**: 2026-01-27

## Command: `sandctl init`

### Modified Behavior

The `init` command is extended with new prompts for git configuration and GitHub token.

### New Flags

```
--git-config-path string    Path to gitconfig file to copy to sandboxes
--git-user-name string      Git user.name for commits
--git-user-email string     Git user.email for commits
--github-token string       GitHub personal access token for PR creation
```

### Flag Validation

- `--git-config-path` and `--git-user-name`/`--git-user-email` are mutually exclusive
- If `--git-user-name` is provided, `--git-user-email` must also be provided (and vice versa)
- `--git-user-email` must be valid email format

### Interactive Flow (additions)

After existing prompts (Hetzner token, SSH key, region, server type, OpenCode key):

```
Git Configuration (optional, for agent commits)
==============================================

Detected existing git config:
  Name:  John Doe
  Email: john@example.com
  Path:  ~/.gitconfig

Use this configuration? [Y/n]: y

OR (if no existing config detected):

Git user name (press Enter to skip): John Doe
Git user email (press Enter to skip): john@example.com

GitHub Integration (optional, for PR creation)
==============================================

GitHub personal access token (press Enter to skip): <hidden input>

Configuration saved successfully to ~/.sandctl/config
```

### Non-Interactive Examples

```bash
# Use existing gitconfig file
sandctl init --hetzner-token TOKEN --ssh-agent --git-config-path ~/.gitconfig

# Use manual git values
sandctl init --hetzner-token TOKEN --ssh-agent --git-user-name "John Doe" --git-user-email "john@example.com"

# With GitHub token
sandctl init --hetzner-token TOKEN --ssh-agent --git-config-path ~/.gitconfig --github-token ghp_xxxxx

# Skip git config entirely (existing behavior)
sandctl init --hetzner-token TOKEN --ssh-agent
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (invalid flags, file not found, etc.) |

### Error Messages

```
Error: --git-config-path and --git-user-name/--git-user-email are mutually exclusive
Error: --git-user-name requires --git-user-email to be set
Error: git user email format invalid: must contain @
Error: git config file not found: ~/.gitconfig
```

---

## Command: `sandctl new`

### Modified Behavior

The `new` command is extended to:
1. Warn if git config is not set
2. Copy git config to sandbox after provisioning
3. Authenticate GitHub CLI if token is configured

### New Output Messages

```
Creating new session...
⠋ Provisioning VM
⠋ Waiting for VM to be ready
⠋ Waiting for setup to complete
⠋ Setting up OpenCode
⠋ Configuring git
⠋ Authenticating GitHub CLI

Session created: fuzzy-rabbit
IP address: 1.2.3.4
```

### Warning Messages

```
Warning: Git configuration not found. Commits in sandbox will require manual git config.
Use 'sandctl init' to configure git user name and email.
```

---

## Sandbox Environment

### Files Created in Sandbox

| Path | Source | Created When |
|------|--------|--------------|
| `/home/agent/.gitconfig` | User's `~/.gitconfig` OR generated | git_config_path OR git_user_name/email set |
| `~/.config/gh/hosts.yml` | gh auth login | github_token set |

### Generated Gitconfig (manual mode)

When `git_user_name` and `git_user_email` are used:

```ini
[user]
	name = John Doe
	email = john@example.com
```

### GitHub CLI State

When `github_token` is configured:

```bash
# These commands succeed in sandbox:
gh auth status
gh pr create --title "Title" --body "Body"
git push  # Uses gh for HTTPS auth
```

---

## Config File Contract

### New Fields

```yaml
# Git configuration (choose one mode)
git_config_path: "~/.gitconfig"      # File mode: copy entire file
# OR
git_user_name: "John Doe"            # Manual mode: generate minimal config
git_user_email: "john@example.com"

# GitHub integration
github_token: "ghp_xxxxx"            # Optional: for PR creation
```

### Validation Rules

1. `git_config_path` expands `~` to home directory
2. If `git_config_path` set, file must exist
3. If `git_user_name` set, `git_user_email` must also be set
4. `git_user_email` must contain `@` with non-empty parts

---

## Test Scenarios

### E2E Test: Agent Can Commit

```bash
# Setup
sandctl init --hetzner-token $TOKEN --ssh-agent --git-user-name "Test User" --git-user-email "test@example.com"
sandctl new --no-console

# Test
sandctl exec $SESSION -c "cd /tmp && git init && echo test > test.txt && git add . && git commit -m 'test'"
sandctl exec $SESSION -c "git log --format='%an <%ae>'"

# Expected output: "Test User <test@example.com>"

# Cleanup
sandctl destroy $SESSION --force
```

### E2E Test: Agent Can Create PR (requires GitHub token)

```bash
# Setup
sandctl init --hetzner-token $TOKEN --ssh-agent --git-config-path ~/.gitconfig --github-token $GH_TOKEN
sandctl new --no-console

# Test
sandctl exec $SESSION -c "gh auth status"

# Expected: Shows logged in status for github.com

# Cleanup
sandctl destroy $SESSION --force
```
