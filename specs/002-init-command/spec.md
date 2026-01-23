# Feature Specification: Init Command

**Feature Branch**: `002-init-command`
**Created**: 2026-01-22
**Status**: Draft
**Input**: User description: "The CLI should have an init command, that prompts the user for required settings - preferred AI agent, API keys, etc."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time Setup (Priority: P1)

A new user installs sandctl and needs to configure it before they can create sandbox sessions. They run `sandctl init` and are guided through entering their Sprites token, selecting their preferred AI agent, and providing the necessary API key for that agent. The command creates a properly secured configuration file.

**Why this priority**: This is the core functionality - without it, users cannot use sandctl at all. The init command removes the barrier of manually creating config files and ensures proper security settings.

**Independent Test**: Can be fully tested by running `sandctl init` on a fresh system and verifying a valid config file is created with correct permissions (0600).

**Acceptance Scenarios**:

1. **Given** no config file exists, **When** the user runs `sandctl init`, **Then** the system prompts for Sprites token, default agent selection, and agent API key
2. **Given** the user provides valid inputs, **When** the init process completes, **Then** a config file is created at `~/.sandctl/config` with secure permissions (0600)
3. **Given** the user provides all required information, **When** the config file is created, **Then** the user can immediately run `sandctl start` without additional configuration

---

### User Story 2 - Reconfigure Existing Setup (Priority: P2)

A user who has already configured sandctl wants to change their settings (e.g., switch default agent, update API keys, or add API keys for additional agents). They run `sandctl init` and can update their configuration while preserving any settings they don't want to change.

**Why this priority**: Important for ongoing use but not required for initial adoption. Users need to be able to update settings without manually editing files.

**Independent Test**: Can be tested by running `sandctl init` when a config already exists and verifying existing values are shown as defaults.

**Acceptance Scenarios**:

1. **Given** a config file already exists, **When** the user runs `sandctl init`, **Then** the system shows current values as defaults for each prompt
2. **Given** the user presses Enter without entering a value, **When** on a prompt with a default, **Then** the existing value is preserved
3. **Given** the user enters a new value, **When** on any prompt, **Then** the new value replaces the existing one

---

### User Story 3 - Non-Interactive Setup (Priority: P3)

An advanced user or automation script needs to configure sandctl without interactive prompts. They can pass all required values as command-line flags to `sandctl init`.

**Why this priority**: Enables automation and CI/CD use cases, but most users will use interactive mode.

**Independent Test**: Can be tested by running `sandctl init` with all required flags and verifying config creation without any prompts.

**Acceptance Scenarios**:

1. **Given** the user runs `sandctl init --sprites-token TOKEN --agent claude --api-key KEY`, **When** all required values are provided, **Then** the config is created without prompting
2. **Given** the user runs `sandctl init` with some but not all flags, **When** in non-interactive mode, **Then** the command fails with a clear error about missing values
3. **Given** the user runs `sandctl init --help`, **When** viewing help, **Then** all available flags are documented with descriptions

---

### Edge Cases

- What happens when the user provides an invalid Sprites token format? System accepts it (validation happens on first use, not during init)
- What happens when the user cancels mid-setup (Ctrl+C)? No partial config file is created; if updating, original file is preserved
- What happens when the config directory cannot be created? Clear error message explaining the issue with suggested remediation
- What happens when the user selects an agent but doesn't provide an API key for it? Warning is shown but config is still created (API key can be added later)
- What happens when file permissions cannot be set to 0600? Error message is shown and config file is not created (security requirement)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `sandctl init` command that guides users through initial configuration
- **FR-002**: System MUST prompt for Sprites token (required for all sandctl operations)
- **FR-003**: System MUST prompt for default AI agent selection from available options (claude, opencode, codex)
- **FR-004**: System MUST prompt for the API key corresponding to the selected default agent
- **FR-005**: System MUST create the config file with secure permissions (0600 - owner read/write only)
- **FR-006**: System MUST create the config directory (`~/.sandctl/`) if it doesn't exist with permissions 0700
- **FR-007**: System MUST show existing values as defaults when a config file already exists
- **FR-008**: System MUST preserve existing config values when user presses Enter without input
- **FR-009**: System MUST support non-interactive mode via command-line flags (`--sprites-token`, `--agent`, `--api-key`)
- **FR-010**: System MUST mask/hide API key and token input for security (no echo to terminal)
- **FR-011**: System MUST validate that the selected agent type is one of the supported options
- **FR-012**: System MUST display a success message with next steps upon successful configuration
- **FR-013**: System MUST not create or modify any files if the user cancels the operation
- **FR-014**: System MUST provide links to where users can obtain their tokens/API keys during prompts

### Key Entities

- **Configuration**: Stores user preferences including Sprites token, default agent type, and agent API keys. Persisted as YAML in user's home directory.
- **Agent Type**: One of the supported AI agents (claude, opencode, codex). Determines which AI service is used for sandbox sessions.
- **API Key**: Authentication credential for the selected AI agent service. Stored securely in config file.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete the init process in under 2 minutes with no prior knowledge
- **SC-002**: 100% of users who complete init can immediately run `sandctl start` successfully
- **SC-003**: Config files are created with correct permissions (0600) in 100% of cases
- **SC-004**: Users receive clear, actionable guidance at each step (token sources, agent descriptions)
- **SC-005**: Non-interactive mode supports all configuration options available in interactive mode

## Assumptions

- Users have terminal access and are comfortable with command-line interfaces
- The Sprites token and agent API keys are obtained separately by the user before running init
- The default agent is Claude if not specified (aligns with existing config behavior)
- Input masking for sensitive values is standard CLI behavior (similar to password prompts)
- The config file format (YAML) is already established and should not change
