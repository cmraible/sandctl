# Research: Sandbox Git Configuration

**Feature**: 019-sandbox-git-config
**Date**: 2026-01-27
**Status**: Complete

## Research Questions

### 1. How to securely pass GitHub token to sandbox for `gh` authentication?

**Decision**: Use `gh auth login --with-token` via stdin through SSH command execution.

**Rationale**:
- The `--with-token` flag reads the token from stdin, not as a command-line argument (which would be visible in process lists)
- This avoids storing the token in cloud-init user-data (which is visible via VM metadata APIs)
- Token is passed over the existing SSH connection which is already encrypted
- Follows GitHub CLI's recommended non-interactive authentication pattern

**Implementation**:
```bash
echo "$GITHUB_TOKEN" | gh auth login --with-token --hostname github.com
```

**Alternatives considered**:
1. **Environment variable (`GH_TOKEN`)**: Suitable for automation but requires persisting the variable in a file (security risk)
2. **Cloud-init write_files**: Would embed token in user-data visible via cloud provider APIs
3. **Secrets manager (Vault, AWS Secrets Manager)**: Over-engineered for a developer CLI tool

**Additional setup required**: Configure git to use `gh` for HTTPS credentials:
```bash
gh auth setup-git
```

**Sources**:
- [gh auth login documentation](https://cli.github.com/manual/gh_auth_login)
- [GitHub CLI Discussion #5351](https://github.com/cli/cli/discussions/5351)

---

### 2. How to handle user's gitconfig file in cloud-init?

**Decision**: Generate gitconfig content dynamically using the existing SSH-based setup pattern (similar to OpenCode setup).

**Rationale**:
- sandctl already has a pattern for post-provisioning setup via SSH (see `setupOpenCodeViaSSH`)
- Avoids embedding config directly in cloud-init user-data
- Allows validation and secure handling of the config content
- Works for both file-based config (copy entire file) and manual entry (generate minimal config)

**Implementation approaches**:

**Option A: Copy user's entire gitconfig** (when path configured)
1. Read user's `~/.gitconfig` during `sandctl new`
2. Base64 encode and transfer via SSH
3. Write to `/home/agent/.gitconfig` with proper ownership

**Option B: Generate minimal gitconfig** (when name/email manually entered)
```ini
[user]
    name = User Name
    email = user@example.com
```

**Alternatives considered**:
1. **Cloud-init write_files**: Would work but user-data has size limits and is less flexible
2. **Git config commands**: Running `git config --global user.name "X"` is simpler but doesn't preserve aliases/signing settings

**Sources**:
- [cloud-init write_files examples](https://cloudinit.readthedocs.io/en/latest/reference/examples.html)
- [Best practices for securing cloud-init](https://wafatech.sa/blog/linux/linux-security/best-practices-for-securing-cloud-init-configurations-on-linux-servers/)

---

### 3. What git email validation should be performed?

**Decision**: Validate using standard email format regex, but be permissive since git accepts many formats.

**Rationale**:
- Git itself accepts almost any string as user.email
- Common patterns like `user@example.com` and `user+tag@example.com` must work
- GitHub uses `username@users.noreply.github.com` for privacy
- Overly strict validation causes friction without adding security

**Implementation**:
```go
// Basic email format validation
func isValidGitEmail(email string) bool {
    // Must contain @ with content on both sides
    parts := strings.Split(email, "@")
    return len(parts) == 2 && len(parts[0]) > 0 && len(parts[1]) > 0
}
```

**Alternatives considered**:
1. **Strict RFC 5322 validation**: Too strict, rejects valid git emails
2. **No validation**: Could cause confusion if user enters malformed email

---

### 4. Should git configuration be mandatory?

**Decision**: Optional with warning during sandbox creation (per FR-004a from spec).

**Rationale**:
- User may want sandbox for tasks that don't require git commits
- Blocking sandbox creation is too disruptive
- Warning provides visibility without blocking workflow
- Follows principle of least surprise

**Implementation**:
- During `sandctl init`: Prompt for git config, allow skipping
- During `sandctl new`: If git config not set, print warning but proceed

---

### 5. How to detect existing gitconfig on user's machine?

**Decision**: Check for `~/.gitconfig` file and parse `user.name` and `user.email` using `git config --global` commands.

**Rationale**:
- `git config --global --get user.name` returns the effective value regardless of file location
- Works with XDG config location (`~/.config/git/config`)
- Handles include directives in gitconfig
- Standard approach used by other tools

**Implementation**:
```go
// Try to get git config using git command
func getGitConfig(key string) (string, error) {
    cmd := exec.Command("git", "config", "--global", "--get", key)
    output, err := cmd.Output()
    if err != nil {
        return "", err
    }
    return strings.TrimSpace(string(output)), nil
}
```

---

### 6. GitHub CLI installation in Ubuntu 24.04

**Decision**: Install `gh` CLI from GitHub's official apt repository during cloud-init.

**Rationale**:
- Ubuntu 24.04's default repos may have outdated `gh` version
- GitHub's repo provides latest stable version
- `gh auth login --with-token` is well-supported

**Implementation** (add to cloud-init script):
```bash
# Install GitHub CLI
type -p curl >/dev/null || apt-get install -y curl
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update
apt-get install -y gh
```

**Sources**:
- [GitHub CLI installation instructions](https://github.com/cli/cli/blob/trunk/docs/install_linux.md)

---

## Summary of Technical Decisions

| Area | Decision |
|------|----------|
| GitHub token delivery | Via SSH + stdin to `gh auth login --with-token` |
| Gitconfig delivery | Via SSH after provisioning (like OpenCode setup) |
| Email validation | Basic @ validation, permissive |
| Git config requirement | Optional with warning |
| Gitconfig detection | Use `git config --global --get` commands |
| GitHub CLI installation | From GitHub's official apt repository |
