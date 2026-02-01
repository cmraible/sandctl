# Data Model: Sandbox Git Configuration

**Feature**: 019-sandbox-git-config
**Date**: 2026-01-27
**Status**: Complete

## Entities

### 1. Config (Modified)

**Location**: `internal/config/config.go`

**Existing fields** (unchanged):
```go
type Config struct {
    DefaultProvider    string                    `yaml:"default_provider,omitempty"`
    SSHPublicKey       string                    `yaml:"ssh_public_key,omitempty"`
    Providers          map[string]ProviderConfig `yaml:"providers,omitempty"`
    SSHKeySource       string                    `yaml:"ssh_key_source,omitempty"`
    SSHPublicKeyInline string                    `yaml:"ssh_public_key_inline,omitempty"`
    SSHKeyFingerprint  string                    `yaml:"ssh_key_fingerprint,omitempty"`
    SpritesToken       string                    `yaml:"sprites_token,omitempty"`
    OpencodeZenKey     string                    `yaml:"opencode_zen_key,omitempty"`
}
```

**New fields** to add:
```go
// Git configuration for sandbox
GitConfigPath  string `yaml:"git_config_path,omitempty"`  // Path to user's gitconfig file (e.g., ~/.gitconfig)
GitUserName    string `yaml:"git_user_name,omitempty"`    // Git user.name (if manually configured)
GitUserEmail   string `yaml:"git_user_email,omitempty"`   // Git user.email (if manually configured)

// GitHub configuration
GitHubToken    string `yaml:"github_token,omitempty"`     // GitHub personal access token (optional)
```

**Validation rules**:
- `GitUserEmail`: If set, must be valid email format (contains `@` with content on both sides)
- `GitConfigPath`: If set, file must exist and be readable
- `GitHubToken`: No validation (GitHub validates on use)
- Either `GitConfigPath` OR (`GitUserName` AND `GitUserEmail`) can be set, not both

**Relationships**:
- Git config is independent of provider configuration
- Git config is independent of SSH key configuration
- GitHub token is optional and independent of git config

---

### 2. GitConfig (Helper struct)

**Purpose**: Internal struct for passing git configuration during sandbox setup

**Definition**:
```go
// GitConfig holds git configuration to apply in sandbox
type GitConfig struct {
    // Mode indicates how git config was provided
    Mode string // "file" or "manual"

    // File mode: content of user's gitconfig file
    FileContent string

    // Manual mode: individual values
    UserName  string
    UserEmail string
}
```

**State transitions**: N/A (value object)

---

## Configuration File Example

### Complete config with file-based gitconfig and GitHub token

```yaml
default_provider: hetzner
ssh_public_key: ~/.ssh/id_ed25519.pub
opencode_zen_key: "your-opencode-zen-key"

# Git configuration - file mode (copies entire gitconfig)
git_config_path: ~/.gitconfig

# GitHub token for PR creation (optional)
github_token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

providers:
  hetzner:
    token: "your-hetzner-api-token"
    region: ash
    server_type: cpx31
    image: ubuntu-24.04
```

### Config with manually entered git name/email

```yaml
default_provider: hetzner
ssh_public_key: ~/.ssh/id_ed25519.pub
opencode_zen_key: "your-opencode-zen-key"

# Git configuration - manual mode
git_user_name: "John Doe"
git_user_email: "john@example.com"

providers:
  hetzner:
    token: "your-hetzner-api-token"
    region: ash
    server_type: cpx31
    image: ubuntu-24.04
```

### Minimal config (no git configuration)

```yaml
default_provider: hetzner
ssh_public_key: ~/.ssh/id_ed25519.pub

providers:
  hetzner:
    token: "your-hetzner-api-token"
    region: ash
    server_type: cpx31
    image: ubuntu-24.04
```

---

## Methods to Add

### Config Methods

```go
// HasGitConfig returns true if git configuration is present
func (c *Config) HasGitConfig() bool

// GetGitConfig returns the git configuration for sandbox setup
// Returns nil if no git configuration is present
func (c *Config) GetGitConfig() (*GitConfig, error)

// HasGitHubToken returns true if GitHub token is configured
func (c *Config) HasGitHubToken() bool

// ValidateGitConfig validates git-specific configuration
func (c *Config) ValidateGitConfig() error
```

---

## File Permissions

| File | Permissions | Rationale |
|------|-------------|-----------|
| `~/.sandctl/config` | 0600 | Contains API tokens and GitHub token |
| `/home/agent/.gitconfig` (in sandbox) | 0644 | Standard gitconfig permissions |

---

## Security Considerations

1. **GitHub Token Storage**:
   - Stored in `~/.sandctl/config` (already protected with 0600 permissions)
   - Never logged or displayed
   - Transmitted via encrypted SSH connection
   - Written to `gh` credential store using `gh auth login --with-token`

2. **Git Config Content**:
   - May contain signing keys or other sensitive data
   - Transmitted via encrypted SSH connection
   - Stored with appropriate permissions in sandbox

3. **Display in Init**:
   - Show current git config values (name, email) when already configured
   - Never display full GitHub token (use masked display like `ghp_xxxx...xxxx`)
