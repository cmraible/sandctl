# Feature Specification: Rename Start Command to New

**Feature Branch**: `010-rename-start-to-new`
**Created**: 2026-01-25
**Status**: Draft
**Input**: User description: "Rename the `sandctl start` command to `sandctl new`, and eliminate the --prompt flag. Running `sandctl new` should create the sprite with no arguments provided."

## Clarifications

### Session 2026-01-25

- Q: How should the Session Prompt field be handled since prompts are no longer provided? → A: Remove the Prompt field from Session entirely (clean slate)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create New Sandbox Session (Priority: P1)

A developer wants to quickly create a new sandboxed environment without having to specify a task prompt upfront. They run `sandctl new` and the system provisions a fresh sandbox VM that they can later connect to and work in interactively.

**Why this priority**: This is the core functionality being changed. Without this working, the command serves no purpose.

**Independent Test**: Can be fully tested by running `sandctl new` and verifying a new session is created and listed in `sandctl list`. Delivers immediate value by providing a ready-to-use sandbox environment.

**Acceptance Scenarios**:

1. **Given** sandctl is initialized with valid credentials, **When** user runs `sandctl new`, **Then** a new sandbox session is provisioned with a human-readable name and appears in the session list with "running" status
2. **Given** sandctl is initialized with valid credentials, **When** user runs `sandctl new`, **Then** the command completes without requiring any arguments or flags
3. **Given** a session was created via `sandctl new`, **When** user runs `sandctl exec <session-name>`, **Then** they can connect to the sandbox and work interactively

---

### User Story 2 - Create Session with Auto-Destroy Timeout (Priority: P2)

A developer wants to create a sandbox session that will automatically be destroyed after a specified duration to avoid resource waste. They run `sandctl new --timeout 2h` to create a session that will be cleaned up after 2 hours.

**Why this priority**: The timeout functionality is an existing feature that should be preserved, but it's optional and not core to the command rename.

**Independent Test**: Can be fully tested by creating a session with `sandctl new --timeout 1m` and verifying the session metadata includes the timeout. Delivers value by enabling automatic resource cleanup.

**Acceptance Scenarios**:

1. **Given** sandctl is initialized with valid credentials, **When** user runs `sandctl new --timeout 2h`, **Then** a session is created with the timeout recorded in session metadata
2. **Given** an invalid timeout format is provided, **When** user runs `sandctl new --timeout invalid`, **Then** an error message explains the expected format (e.g., "1h", "30m")

---

### Edge Cases

- What happens when provisioning fails mid-way? The session is cleaned up (sprite deleted) and an error is reported to the user
- What happens if the user is not initialized? An error prompts the user to run `sandctl init`
- What happens if the sprites API is unavailable? A clear error message about connectivity is displayed
- What happens if a session name collision occurs? The system generates a unique name automatically (existing behavior)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST rename the CLI command from `start` to `new`
- **FR-002**: System MUST NOT require a `--prompt` flag to create a session
- **FR-003**: System MUST provision a sprite (sandbox VM) when `sandctl new` is executed
- **FR-004**: System MUST install development tools in the provisioned sandbox (git, node, python3)
- **FR-005**: System MUST install OpenCode in the provisioned sandbox
- **FR-006**: System MUST set up OpenCode authentication using the configured Zen key
- **FR-007**: System MUST NOT automatically start OpenCode with a prompt after provisioning
- **FR-008**: System MUST preserve the optional `--timeout` flag for auto-destroy functionality
- **FR-009**: System MUST generate a unique human-readable session name
- **FR-010**: System MUST save the session to the local session store with appropriate status
- **FR-011**: System MUST display the session name and connection instructions upon successful creation
- **FR-012**: System MUST clean up failed sessions (delete sprite, update store status)
- **FR-013**: System MUST return an "unknown command" error when users attempt to run the old `sandctl start` command
- **FR-014**: System MUST remove the Prompt field from the Session data model

### Key Entities

- **Session**: Represents a sandbox environment instance with properties: ID (human-readable name), status (provisioning/running/failed), creation timestamp, and optional timeout duration. The Prompt field is removed from the data model entirely.
- **Sprite**: The underlying Fly.io VM that hosts the sandbox environment

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a new sandbox session by running `sandctl new` with no required arguments
- **SC-002**: Session creation completes successfully with all provisioning steps (VM, tools, OpenCode, auth)
- **SC-003**: Created sessions are accessible via `sandctl exec <session-name>` for interactive use
- **SC-004**: Existing timeout functionality continues to work as expected with `--timeout` flag
- **SC-005**: The old `sandctl start` command is no longer recognized (returns "unknown command" error)
