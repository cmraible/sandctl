# Feature Specification: Rewrite sandctl in TypeScript with Bun

**Feature Branch**: `020-typescript-rewrite`
**Created**: 2026-02-20
**Status**: Draft
**Input**: Rewrite the existing Go CLI (`sandctl`) in TypeScript using the Bun runtime, shipping it as a native executable. All existing user-facing behavior must be preserved.

> **Implementation Strategy**: The TypeScript version will be developed in a `sandctl-ts/` subdirectory alongside the existing Go implementation. The Go implementation will remain untouched and operational until the TypeScript version reaches full parity. Only after parity is confirmed will the TypeScript version replace the Go implementation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install and Run sandctl Binary (Priority: P1)

A user downloads or installs the `sandctl` binary for their platform. The binary is a self-contained native executable (compiled via `bun build --compile`) that requires no external runtime. The user runs `sandctl version` and sees version information. The binary supports macOS (arm64, amd64) and Linux (amd64, arm64).

**Why this priority**: Without a working binary, no other features can be used. This is the foundational build and distribution story.

**Independent Test**: Download the compiled binary, run `sandctl version`, verify it prints version/commit/build info.

**Acceptance Scenarios**:

1. **Given** a compiled `sandctl` binary for the user's platform, **When** the user runs `sandctl version`, **Then** it prints the version, commit hash, and build timestamp
2. **Given** the binary is compiled with `bun build --compile`, **When** the user runs it, **Then** no external runtime (Node.js, Bun) is required
3. **Given** the user runs `sandctl --help`, **Then** it shows all available commands with descriptions
4. **Given** the user runs `sandctl` with no arguments, **Then** it shows help text
5. **Given** the user passes `--verbose` or `-v` flag, **Then** debug output is enabled for all commands

---

### User Story 2 - Initialize Configuration (Priority: P1)

A user runs `sandctl init` to set up their configuration. The command works both interactively (prompting for values) and non-interactively (via flags). Configuration is saved as YAML at `~/.sandctl/config` with 0600 permissions.

**Why this priority**: Configuration is required before any sandbox can be created. This must work before all other commands.

**Independent Test**: Run `sandctl init` with flags, verify config file is created with correct values and permissions.

**Acceptance Scenarios**:

1. **Given** no existing config, **When** the user runs `sandctl init` interactively, **Then** they are prompted for Hetzner token, SSH key configuration, region, server type, and optional git/GitHub settings
2. **Given** the user provides `--hetzner-token` and `--ssh-public-key` flags, **When** running `sandctl init`, **Then** config is created non-interactively
3. **Given** the user provides `--ssh-agent` flag, **When** running `sandctl init`, **Then** SSH agent mode is configured instead of key file mode
4. **Given** `--ssh-agent` and `--ssh-public-key` are both provided, **When** running `sandctl init`, **Then** an error is returned (mutually exclusive)
5. **Given** an existing config, **When** the user runs `sandctl init` interactively, **Then** existing values are shown as defaults
6. **Given** the user provides `--git-user-email` with an invalid email (no `@`), **When** running `sandctl init`, **Then** a validation error is returned
7. **Given** the user has `~/.gitconfig` on their machine, **When** running `sandctl init` interactively, **Then** the system detects and offers to use existing git name/email
8. **Given** config is saved, **When** checking file permissions, **Then** the file has 0600 permissions and the directory has 0700 permissions

---

### User Story 3 - Create a New Sandbox Session (Priority: P1)

A user runs `sandctl new` to create a sandboxed VM for an AI agent. The command provisions a VM, waits for it to become ready, configures it (SSH, git, GitHub CLI, template scripts), and optionally opens an interactive console.

**Why this priority**: Session creation is the core functionality of the tool.

**Independent Test**: Run `sandctl new`, verify a VM is provisioned on Hetzner, session is recorded locally, and the sandbox is accessible via SSH.

**Acceptance Scenarios**:

1. **Given** valid config, **When** the user runs `sandctl new`, **Then** a VM is provisioned, a human-readable session name is generated, and the session is recorded locally
2. **Given** the `-t 1h` flag, **When** creating a session, **Then** the session records a 1-hour timeout
3. **Given** the `--no-console` flag, **When** creating a session, **Then** the console auto-connect is skipped
4. **Given** the `-T mytemplate` flag, **When** creating a session, **Then** the template's init script is executed on the sandbox after provisioning
5. **Given** git config is set, **When** creating a session, **Then** git configuration is copied to the sandbox's agent user
6. **Given** GitHub token is set, **When** creating a session, **Then** GitHub CLI is authenticated in the sandbox
7. **Given** provisioning fails, **When** the error occurs, **Then** the VM is cleaned up and the session is marked as failed
8. **Given** an interactive terminal, **When** session creation completes (without `--no-console`), **Then** an interactive SSH console is automatically opened
9. **Given** the `--region`, `--server-type`, or `--image` flags, **When** creating a session, **Then** provider defaults are overridden for this session

---

### User Story 4 - List Sessions (Priority: P1)

A user runs `sandctl list` (alias: `ls`) to see all their sandbox sessions. Sessions are synced with the provider to show current status.

**Why this priority**: Users need to see what sessions exist to manage them.

**Independent Test**: Create a session, run `sandctl list`, verify it appears in the output with correct status.

**Acceptance Scenarios**:

1. **Given** active sessions exist, **When** the user runs `sandctl list`, **Then** a table is displayed with columns: ID, PROVIDER, STATUS, CREATED, TIMEOUT
2. **Given** the `-f json` flag, **When** listing sessions, **Then** output is formatted as pretty-printed JSON
3. **Given** the `-a` flag, **When** listing sessions, **Then** stopped and failed sessions are also shown
4. **Given** no active sessions, **When** listing sessions, **Then** "No active sessions." is displayed with a hint to use `sandctl new`
5. **Given** a session has a timeout, **When** listing sessions, **Then** the remaining time is shown (e.g., "2h remaining", "expired")
6. **Given** sessions exist, **When** listing, **Then** session status is synced with the provider's current VM state

---

### User Story 5 - Open Interactive Console (Priority: P1)

A user runs `sandctl console <name>` to open an interactive SSH terminal to a running session.

**Why this priority**: Interactive access to sandboxes is essential for debugging and monitoring agent work.

**Independent Test**: Create a session, run `sandctl console <name>`, verify an interactive terminal opens with full PTY support.

**Acceptance Scenarios**:

1. **Given** a running session, **When** the user runs `sandctl console <name>`, **Then** an interactive SSH terminal is opened with PTY support
2. **Given** the session name in different case, **When** running console, **Then** it matches case-insensitively
3. **Given** stdin is not a TTY, **When** running console, **Then** an error is returned: "console requires an interactive terminal"
4. **Given** a non-existent session name, **When** running console, **Then** a helpful error is returned suggesting `sandctl list`

---

### User Story 6 - Execute Commands in Sessions (Priority: P1)

A user runs `sandctl exec <name>` to execute commands in a running session.

**Why this priority**: Command execution is needed for automation and scripting workflows.

**Independent Test**: Create a session, run `sandctl exec <name> -c "echo hello"`, verify "hello" is printed to stdout.

**Acceptance Scenarios**:

1. **Given** a running session and `-c "ls -la"`, **When** running exec, **Then** the command output is printed to stdout
2. **Given** a running session and no `-c` flag, **When** running exec in a TTY, **Then** an interactive shell is opened
3. **Given** a non-running session, **When** running exec, **Then** an error is returned indicating the session is not running

---

### User Story 7 - Destroy Sessions (Priority: P1)

A user runs `sandctl destroy <name>` (aliases: `rm`, `delete`) to terminate and remove a session.

**Why this priority**: Users must be able to clean up resources to avoid unnecessary cloud costs.

**Independent Test**: Create a session, run `sandctl destroy <name> --force`, verify VM is deleted and session is removed.

**Acceptance Scenarios**:

1. **Given** a running session, **When** the user runs `sandctl destroy <name>`, **Then** a confirmation prompt is shown
2. **Given** the user confirms destruction, **When** destroying, **Then** the VM is deleted from the provider and the session is removed locally
3. **Given** the `--force` flag, **When** destroying, **Then** the confirmation prompt is skipped
4. **Given** a non-existent session, **When** destroying, **Then** a helpful error is returned
5. **Given** the VM provider fails to delete, **When** destroying, **Then** a warning is logged but local cleanup continues

---

### User Story 8 - Manage Templates (Priority: P2)

A user manages template configurations that customize sandbox initialization. Templates contain init scripts that run after VM provisioning.

**Why this priority**: Templates add customization but aren't required for basic sandbox usage.

**Independent Test**: Run `sandctl template add mytemplate`, verify template directory and init script are created.

**Acceptance Scenarios**:

1. **Given** the user runs `sandctl template add <name>`, **Then** a template directory is created with a stub init.sh, and the user's editor is opened
2. **Given** existing templates, **When** running `sandctl template list`, **Then** a table shows template names and creation dates
3. **Given** a template exists, **When** running `sandctl template show <name>`, **Then** the init script content is printed to stdout
4. **Given** a template exists, **When** running `sandctl template edit <name>`, **Then** the init script is opened in the user's editor
5. **Given** a template exists, **When** running `sandctl template remove <name>`, **Then** a confirmation prompt is shown (skippable with `--force`)
6. **Given** a template does not exist, **When** running `sandctl template add <name>` with the same name as an existing template, **Then** an error suggests using `template edit`
7. **Given** the EDITOR env var is not set, **When** adding/editing a template, **Then** the system falls back to VISUAL, then vim, vi, nano

---

### User Story 9 - SSH Agent Integration (Priority: P2)

A user configures sandctl to use their SSH agent (ssh-agent, 1Password, gpg-agent) instead of a key file. The agent is used for both provider API key upload and sandbox SSH connections.

**Why this priority**: SSH agent support enables 1Password and hardware key users but is not required for basic file-based key usage.

**Independent Test**: Configure SSH agent mode, create a session, verify SSH connections use agent-forwarded keys.

**Acceptance Scenarios**:

1. **Given** SSH agent is configured, **When** creating a session, **Then** SSH connections use the agent for authentication
2. **Given** multiple keys are loaded in the agent and `--ssh-key-fingerprint` is set, **When** connecting, **Then** the specific key is used
3. **Given** no SSH agent socket is found, **When** attempting agent mode, **Then** a clear error is returned
4. **Given** 1Password SSH agent, **When** discovering agents, **Then** the 1Password socket is found via `~/.ssh/config` IdentityAgent

---

### Edge Cases

- What happens when the Hetzner API token is invalid? The `init` command validates credentials; `new` returns an auth error.
- What happens when SSH key file doesn't exist? Validation error during `init`.
- What happens when cloud-init times out? Session is marked as failed after 10-minute timeout.
- What happens when session name pool is exhausted? Error returned when all 250 names are in use.
- What happens with legacy Go-format sessions? Marked as "(legacy)" and treated as stopped.
- What happens when template init script fails? Warning is logged but session remains running for debugging.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: CLI MUST be rewritten in TypeScript using the Bun runtime
- **FR-002**: Binary MUST be compiled to native executables via `bun build --compile` for macOS (arm64, amd64) and Linux (amd64, arm64)
- **FR-003**: All existing commands MUST be preserved: `init`, `new`, `list`, `console`, `exec`, `destroy`, `version`, `template` (add, list, show, edit, remove)
- **FR-004**: All existing flags and arguments MUST be preserved with identical names and behavior
- **FR-005**: Config file format (YAML at `~/.sandctl/config`) MUST remain backward-compatible
- **FR-006**: Session store format (JSON at `~/.sandctl/sessions.json`) MUST remain backward-compatible
- **FR-007**: Template store format (`~/.sandctl/templates/<name>/`) MUST remain backward-compatible
- **FR-008**: Config file MUST be written with 0600 permissions; config directory with 0700
- **FR-009**: CLI MUST support global `--config` and `--verbose` flags
- **FR-010**: CLI MUST use the Hetzner Cloud API for VM provisioning (via `@hetznercloud/hcloud-js` or REST API)
- **FR-011**: CLI MUST support SSH connections for console, exec, and sandbox setup (via an SSH library compatible with Bun)
- **FR-012**: CLI MUST support SSH agent discovery and forwarding (1Password, ssh-agent, gpg-agent)
- **FR-013**: CLI MUST generate human-readable session names from the same 250-name pool, with collision avoidance
- **FR-014**: CLI MUST display progress spinners, formatted tables, and colored output matching current behavior
- **FR-015**: CLI MUST handle interactive prompts (string, secret/masked, select, yes/no) for `init` and `destroy` commands
- **FR-016**: Error messages MUST follow the existing format with `[error]` prefix and helpful suggestions
- **FR-017**: Exit codes MUST match: 0 (success), 2 (config error), 3 (API error), 4 (session not found), 5 (session not ready)
- **FR-018**: GitHub Actions CI MUST be updated with lint, test, build, and e2e jobs for the TypeScript project
- **FR-019**: CLI MUST support cloud-init scripts for VM setup (Docker, agent user, SSH config, GitHub CLI)

### Key Entities

- **Config**: YAML configuration with provider settings, SSH key config, git settings, GitHub token
- **Session**: JSON-stored session with ID, status, provider, provider ID, IP, creation time, timeout
- **Template**: Directory-based template with config.yaml and init.sh script
- **Provider**: Pluggable VM provider interface (currently Hetzner)
- **VM**: Provider-agnostic virtual machine with status lifecycle

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing CLI commands produce identical user-facing output (tables, messages, errors)
- **SC-002**: Compiled binary runs without any external runtime dependency
- **SC-003**: Existing `~/.sandctl/config` files from the Go version are loaded without modification
- **SC-004**: Existing `~/.sandctl/sessions.json` files from the Go version are read without modification
- **SC-005**: CI pipeline passes with lint, unit test, and build jobs
- **SC-006**: E2E tests pass with real Hetzner VM provisioning
- **SC-007**: Binary size is within 2x of the Go binary size
- **SC-008**: Command startup time is under 200ms

## Clarifications

### Session 2026-02-20

- Q: Should the rewrite maintain backward compatibility with existing config/session files? → A: Yes, the YAML config and JSON session store formats must be identical.
- Q: Which SSH library should be used in TypeScript/Bun? → A: Use `ssh2` (the most mature Node.js SSH library) which is compatible with Bun.
- Q: How should the Hetzner API be accessed? → A: Use the `@hetznercloud/hcloud-js` SDK if Bun-compatible, otherwise use direct REST API calls via `fetch`.
- Q: Should the provider plugin architecture be preserved? → A: Yes, maintain the same interface pattern with a registry for provider implementations.

## Assumptions

- Bun's `build --compile` produces stable, production-ready binaries for all target platforms
- The `ssh2` npm package is compatible with Bun's runtime
- Hetzner Cloud API can be accessed via REST or an npm SDK from Bun
- Terminal handling (PTY, raw mode, window resize) works correctly in Bun-compiled binaries
- YAML parsing via a library like `yaml` (npm) produces output compatible with Go's `gopkg.in/yaml.v3`
