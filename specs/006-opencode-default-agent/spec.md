# Feature Specification: Simplified Init with Opencode Zen

**Feature Branch**: `006-opencode-default-agent`
**Created**: 2026-01-22
**Status**: Draft
**Input**: User description: "Rather than asking for multiple API keys, sandctl init should just ask for a sprites api key and an Opencode Zen key, and it should login to opencode with the key"

## Clarifications

### Session 2026-01-22

- Q: Should the `default_agent` field be removed from the config schema entirely, or retained with a fixed value for backwards compatibility? → A: Remove `default_agent` field entirely from config schema.
- Q: What is the exact OpenCode authentication method? → A: Create JSON file at `~/.local/share/opencode/auth.json` with structure `{"opencode": {"type": "api", "key": "<API_KEY>"}}`.
- Q: How should the Zen key be stored locally in sandctl config? → A: Plain text with restrictive file permissions (0600).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Initialize with Sprites and Opencode Zen Keys (Priority: P1)

A user runs `sandctl init` to configure their development environment. The system prompts for only two pieces of information: the Sprites API token (for VM provisioning) and the Opencode Zen key (for AI agent access). No agent selection is required - OpenCode is the default and only option.

**Why this priority**: This is the core change - simplifying onboarding to just two required credentials eliminates confusion about which keys to provide.

**Independent Test**: Can be fully tested by running `sandctl init`, providing both keys, and verifying the configuration is saved correctly.

**Acceptance Scenarios**:

1. **Given** a user has no existing configuration, **When** they run `sandctl init`, **Then** they are prompted only for Sprites API token and Opencode Zen key (no agent selection, no Anthropic/OpenAI prompts).
2. **Given** a user runs `sandctl init --help`, **When** the help text displays, **Then** only `--sprites-token` and `--opencode-zen-key` flags are documented.
3. **Given** a user provides both keys during init, **When** configuration completes, **Then** the saved config contains both keys and no `default_agent` field.

---

### User Story 2 - Automatic OpenCode Login in Sandbox (Priority: P2)

When a sandbox (sprite) is created and started, the system automatically runs the OpenCode authentication command inside the sandbox using the stored Zen key, so the user can immediately use OpenCode without manual login.

**Why this priority**: Streamlines the sandbox experience by pre-authenticating OpenCode before the user enters.

**Independent Test**: Can be tested by running `sandctl start`, waiting for sandbox creation, and verifying OpenCode is authenticated inside the sandbox.

**Acceptance Scenarios**:

1. **Given** a user has configured an Opencode Zen key, **When** the sandbox is provisioned, **Then** the system creates `~/.local/share/opencode/auth.json` with the Zen key inside the sandbox.
2. **Given** the auth file is created successfully, **When** the user enters the sandbox, **Then** OpenCode is ready to use without additional authentication.
3. **Given** the auth file creation fails in the sandbox, **When** provisioning continues, **Then** a warning is displayed but the sandbox is still accessible.
4. **Given** OpenCode installation fails in the sandbox, **When** provisioning continues, **Then** an error is displayed but the sandbox is still accessible.

---

### User Story 3 - Non-Interactive Init Mode (Priority: P3)

A user running in a CI/CD environment or script can provide both keys via command-line flags to complete init without interactive prompts.

**Why this priority**: Enables automation and scripted setup for advanced users.

**Independent Test**: Can be tested by running `sandctl init --sprites-token TOKEN --opencode-zen-key KEY` and verifying configuration is saved.

**Acceptance Scenarios**:

1. **Given** a user runs `sandctl init --sprites-token TOKEN --opencode-zen-key KEY`, **When** both flags are provided, **Then** init completes without prompts and config is saved.
2. **Given** a user runs `sandctl init --sprites-token TOKEN` without the zen key, **When** executed, **Then** an error indicates the missing required flag.
3. **Given** non-interactive mode with valid flags, **When** init completes, **Then** the config is saved (OpenCode login happens later in sandbox).

---

### User Story 4 - Migration from Previous Configuration (Priority: P4)

A user with an existing configuration from a previous version of sandctl upgrades and runs `sandctl init`. The system migrates their config, removing the `default_agent` field and any old agent API keys, while preserving the Sprites token.

**Why this priority**: Ensures smooth upgrades for existing users without breaking their workflow.

**Independent Test**: Can be tested by creating an old-format config file, running init, and verifying migration occurs correctly.

**Acceptance Scenarios**:

1. **Given** a user has an existing config with `default_agent` field, **When** they run `sandctl init`, **Then** the field is removed from the saved config.
2. **Given** a user has existing agent API keys (anthropic, openai, etc.), **When** they run init and provide a new Opencode Zen key, **Then** old agent keys are removed and replaced with the zen key.
3. **Given** a user has an existing Sprites token, **When** they run init, **Then** the existing token is shown as default and can be kept by pressing Enter.

---

### Edge Cases

- What happens when the user provides an empty Opencode Zen key?
  - The system should require the key; init cannot complete without it.
- What happens when OpenCode installation fails in the sandbox?
  - The system should display an error but allow the sandbox to remain accessible.
- What happens when the OpenCode auth file creation fails in the sandbox?
  - The system should display a warning and continue; user can manually create the file.
- What happens when the network is unavailable during sandbox provisioning?
  - The system should retry or fail gracefully with clear error messaging.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST prompt for only two credentials during init: Sprites API token and Opencode Zen key.
- **FR-002**: System MUST remove agent selection prompts and flags entirely (no `--agent` flag, no agent choice menu).
- **FR-003**: System MUST require both Sprites API token and Opencode Zen key to complete init.
- **FR-004**: System MUST store the Opencode Zen key in the configuration file with restrictive permissions (0600) for use during sandbox provisioning.
- **FR-005**: System MUST install OpenCode automatically when provisioning a sandbox.
- **FR-006**: System MUST create the OpenCode auth file (`~/.local/share/opencode/auth.json`) with the stored Zen key inside the sandbox during provisioning.
- **FR-007**: System MUST continue sandbox provisioning even if OpenCode login fails (with appropriate warnings).
- **FR-008**: System MUST remove the `default_agent` field from the configuration schema entirely.
- **FR-009**: System MUST remove any existing agent API key fields (anthropic, openai) from migrated configs.
- **FR-010**: System MUST provide `--sprites-token` and `--opencode-zen-key` flags for non-interactive mode.
- **FR-011**: System MUST display a clear error if either required flag is missing in non-interactive mode.
- **FR-012**: System MUST preserve existing Sprites token as default when reconfiguring.

### Key Entities

- **Configuration**: Stores Sprites API token and Opencode Zen key. No `default_agent` field or multiple agent keys - OpenCode is implicit.
- **Opencode Zen Key**: Authentication credential for the OpenCode AI service, stored locally and used to authenticate OpenCode inside the sandbox during provisioning.
- **Sprites Token**: Credential for VM provisioning through the Sprites service.
- **Sandbox (Sprite)**: Remote development environment where OpenCode is installed and authenticated during provisioning.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users complete `sandctl init` by providing exactly two credentials (Sprites token and Opencode Zen key).
- **SC-002**: Init process completes in under 10 seconds (no network calls, just config storage).
- **SC-003**: 100% of provisioned sandboxes have OpenCode installed and authenticated (when Zen key is configured).
- **SC-004**: Users with legacy configurations can complete init without losing their existing Sprites token.
- **SC-005**: Non-interactive mode works with exactly two flags (`--sprites-token` and `--opencode-zen-key`).

## Assumptions

- OpenCode authenticates via a JSON file at `~/.local/share/opencode/auth.json` with the structure `{"opencode": {"type": "api", "key": "<API_KEY>"}}`.
- The Opencode Zen key is a single credential that provides access to OpenCode services.
- Users who previously used Anthropic/OpenAI keys directly will now use them through OpenCode's authentication system.
- OpenCode can be installed in the sandbox environment via a standard installation method.
- The sandbox environment has network access during provisioning to download OpenCode.
