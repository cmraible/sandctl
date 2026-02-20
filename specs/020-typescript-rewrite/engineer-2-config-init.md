# Engineer 2 — Config, Init Command & Utils

**Stream**: B
**PRs**: PR-02, PR-05, PR-17

## Ownership

You own configuration management and the init command:

| Module | Files |
|--------|-------|
| Config | `src/config/config.ts`, `src/config/writer.ts` |
| Utils | `src/utils/paths.ts` |
| Init command | `src/commands/init.ts` |
| Unit tests | `tests/unit/config/`, `tests/unit/commands/init.test.ts` |
| Docs (later) | `README.md`, `CLAUDE.md` |

---

## PR-02: Config Module + Utils (Tasks T012–T018, T029)

**Blocked by**: PR-01 (scaffold)
**Blocks**: PR-05 (init cmd), PR-10 (provider), PR-11 (SSH), PR-13 (new cmd)

### What to Build

#### 1. Config Types (`src/config/config.ts`)

Define TypeScript interfaces matching the Go structs exactly (see `data-model.md`):

```typescript
interface Config {
  default_provider?: string;
  ssh_key_source?: "file" | "agent";
  ssh_public_key?: string;
  ssh_public_key_inline?: string;
  ssh_key_fingerprint?: string;
  providers?: Record<string, ProviderConfig>;
  sprites_token?: string;           // Legacy field
  opencode_zen_key?: string;
  git_config_path?: string;
  git_user_name?: string;
  git_user_email?: string;
  github_token?: string;
}

interface ProviderConfig {
  token: string;
  region?: string;
  server_type?: string;
  image?: string;
  ssh_key_id?: number;
}
```

Custom error types: `NotFoundError`, `InsecurePermissionsError`, `ValidationError`.

#### 2. Config Loading (`src/config/config.ts`)

Implement `load(configPath?: string)`:
- Default path: `~/.sandctl/config`
- Read file, check permissions are 0600 (throw `InsecurePermissionsError` if not)
- Parse YAML into `Config` type
- Handle legacy format migration (old `sprites_token` field)
- Throw `NotFoundError` if file doesn't exist

#### 3. Config Validation (`src/config/config.ts`)

Implement `validate(config: Config)`:
- Check `default_provider` is set
- Check SSH key is configured (either `ssh_public_key` path or `ssh_key_source: "agent"`)
- Validate email format if `git_user_email` is set (must contain `@` with non-empty parts)

#### 4. Config Writer (`src/config/writer.ts`)

Implement `save(configPath: string, config: Config)`:
- Create directory with 0700 permissions if needed
- Write to temp file first, then atomic rename
- Enforce 0600 file permissions
- Serialize using `yaml` package with `omitempty` behavior (omit undefined fields)

#### 5. Helper Methods (`src/config/config.ts`)

- `getProviderConfig(config, providerName)` → `ProviderConfig | undefined`
- `setProviderSSHKeyID(config, providerName, keyID)` → mutates config
- `getSSHPublicKey(config)` → reads file or returns inline key
- `getGitConfig(config)` → `{ path?: string, name?: string, email?: string }`
- `hasGitConfig(config)` → boolean
- `hasGitHubToken(config)` → boolean

#### 6. Path Utils (`src/utils/paths.ts`)

Implement `expandTilde(path: string)`: Replace leading `~` with `os.homedir()`.

#### 7. Unit Tests

**`tests/unit/config/config.test.ts`**:
- Loading a valid YAML config produces correct types
- Loading with wrong permissions (0644) throws `InsecurePermissionsError`
- Loading non-existent file throws `NotFoundError`
- Validation rejects missing `default_provider`
- Validation rejects missing SSH key config
- Validation rejects invalid email format
- Legacy config migration handles `sprites_token`
- Helper methods return expected values

**`tests/unit/config/writer.test.ts`**:
- Writes YAML with correct content
- Creates directory if missing (0700 permissions)
- File has 0600 permissions after write
- Atomic write: if process crashes mid-write, old file is preserved
- Omits undefined fields from YAML output

### How to Verify

```bash
# Run unit tests
bun test tests/unit/config/

# Verify YAML round-trip compatibility
# Create a config file matching Go format, load it, save it, diff
cat > /tmp/test-config.yaml << 'EOF'
default_provider: hetzner
ssh_key_source: file
ssh_public_key: ~/.ssh/id_ed25519.pub
providers:
  hetzner:
    token: test-token
    region: ash
    server_type: cpx31
    image: ubuntu-24.04
EOF
chmod 600 /tmp/test-config.yaml

# Verify permission check
chmod 644 /tmp/test-config.yaml
# load() should throw InsecurePermissionsError

# Verify types compile cleanly
bun run lint
```

### Constitution Compliance

- **I. Code Quality**: Types mirror Go structs exactly; each function has single responsibility
- **I. Type Safety**: All config fields strongly typed; no `any` usage
- **III. Security**: Config file 0600 permissions enforced; tokens never logged
- **III. Input Validation**: Email format validated; SSH key path validated
- **III. Secrets Management**: Tokens stored in permission-restricted file only

---

## PR-05: Init Command (Tasks T044–T047)

**Blocked by**: PR-02 (config), PR-04 (UI prompts)
**Blocks**: PR-13 (new cmd needs config to exist)

### What to Build

#### 1. Interactive Mode (`src/commands/init.ts`)

When run in a TTY without required flags:

1. Detect existing config → show current values as defaults
2. Prompt for Hetzner token (secret/masked input)
3. Prompt for SSH key mode: select "SSH key file" or "SSH agent"
   - If file: prompt for path (default: `~/.ssh/id_ed25519.pub`)
   - If agent: prompt for fingerprint (optional, needed for multi-key agents)
4. Prompt for region (select: ash, hel1, fsn1, nbg1 — default: ash)
5. Prompt for server type (select: cpx21, cpx31, cpx41, cpx51 — default: cpx31)
6. Detect existing `~/.gitconfig` → offer to use git name/email
7. Prompt for git user name (optional)
8. Prompt for git user email (optional, validate `@` format)
9. Prompt for git config file path (optional, default: `~/.gitconfig` if exists)
10. Prompt for GitHub token (optional, secret/masked)
11. Save config with `save()`
12. Print: "Configuration saved successfully to [path]"
13. Print: Next step suggestion `sandctl new`

#### 2. Non-Interactive Mode

When `--hetzner-token` is provided:
- Require `--hetzner-token` + (`--ssh-agent` OR `--ssh-public-key`)
- Reject `--ssh-agent` + `--ssh-public-key` together (mutually exclusive)
- Reject `--git-user-name` without `--git-user-email` (and vice versa)
- Validate `--git-user-email` contains `@`
- Validate `--ssh-public-key` file exists
- Validate `--git-config-path` file exists (if provided)

#### 3. All Flags

```
--hetzner-token <token>        Hetzner Cloud API token
--ssh-public-key <path>        Path to SSH public key file
--ssh-agent                    Use SSH agent for key management
--ssh-key-fingerprint <fp>     SSH key fingerprint (for multi-key agents)
--region <region>              Default region (ash, hel1, fsn1, nbg1)
--server-type <type>           Default server type (cpx21, cpx31, cpx41, cpx51)
--opencode-zen-key <key>       Opencode Zen key
--git-config-path <path>       Path to gitconfig file
--git-user-name <name>         Git user.name
--git-user-email <email>       Git user.email
--github-token <token>         GitHub personal access token
```

#### 4. Unit Tests (`tests/unit/commands/init.test.ts`)

- `--ssh-agent` + `--ssh-public-key` returns error
- `--git-user-name` without `--git-user-email` returns error
- Invalid email (no `@`) returns validation error
- Non-existent SSH key path returns error
- Valid non-interactive flags produce correct config
- Tilde expansion works in paths (`~/.ssh/id_ed25519.pub` → absolute)

### How to Verify

```bash
# Run unit tests
bun test tests/unit/commands/init.test.ts

# Test non-interactive mode
./sandctl init --hetzner-token test123 --ssh-public-key ~/.ssh/id_ed25519.pub
cat ~/.sandctl/config  # Verify YAML content
stat -c '%a' ~/.sandctl/config  # Linux: should be 600
# macOS: stat -f '%Lp' ~/.sandctl/config

# Test mutual exclusivity
./sandctl init --hetzner-token test --ssh-agent --ssh-public-key ~/.ssh/key.pub
# Should print error about mutually exclusive flags

# Test email validation
./sandctl init --hetzner-token test --ssh-agent --git-user-name "Me" --git-user-email "invalid"
# Should print error about invalid email

# Test interactive mode (in terminal)
./sandctl init
# Should prompt for each setting interactively
```

### Constitution Compliance

- **I. Code Quality**: Separate interactive vs non-interactive code paths; clear flag validation
- **III. Security**: Hetzner token and GitHub token use secret/masked input; never echoed
- **III. Input Validation**: Email, paths, flag conflicts all validated
- **IV. User Privacy**: Clearly prompts explain what data is collected; all optional except token + SSH

---

## PR-17: Documentation Updates (Tasks T080–T081)

**Blocked by**: PR-13 (new cmd — core workflow must work)
**Blocks**: PR-18 (polish)

### What to Build

1. **`README.md`**: Replace Go prerequisites/installation with:
   - Prerequisites: Bun 1.x
   - Build: `bun install && bun run build`
   - Install: `make install`
   - Cross-compile: `make build-all`
   - Quick start: same commands, just different build steps

2. **`CLAUDE.md`**: Replace Go development guidelines with TypeScript/Bun:
   - Active tech: TypeScript 5.x, Bun, commander, ssh2, yaml
   - Commands: `bun test`, `bun run lint`, `bun run build`
   - Code style: Biome-enforced, strict TypeScript

### How to Verify

```bash
# Follow README instructions from scratch
bun install
bun run build
./sandctl --help
# Should work as documented

# Verify links in README are valid
# Verify command examples actually work
```

### Constitution Compliance

- **I. Code Quality**: Documentation is accurate and up-to-date with actual build commands
