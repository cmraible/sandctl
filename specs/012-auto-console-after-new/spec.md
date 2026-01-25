# Feature Specification: Auto Console After New

**Feature Branch**: `012-auto-console-after-new`
**Created**: 2026-01-25
**Status**: Draft
**Input**: User description: "When I run `sandctl new`, it should create the sprite and install things as it currently does, then it should automatically start a console session, as if I ran `sandctl console <name>` immediately after it's done provisioning"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seamless Session Creation and Connection (Priority: P1)

As a developer, when I create a new sandbox session with `sandctl new`, I want to be automatically connected to an interactive terminal session immediately after provisioning completes, so I can start working without running a separate command.

**Why this priority**: This is the core feature request. Currently users must run two commands (`sandctl new` followed by `sandctl console <name>`), which adds friction to the workflow. Automatic console connection removes this friction and provides a seamless experience.

**Independent Test**: Run `sandctl new` in an interactive terminal and verify that after provisioning completes, the user is automatically placed in an interactive shell session inside the sandbox.

**Acceptance Scenarios**:

1. **Given** an interactive terminal with valid configuration, **When** user runs `sandctl new`, **Then** the system provisions the sandbox, installs tools, and automatically opens an interactive console session.

2. **Given** a running `sandctl new` with auto-console, **When** user exits the console session (Ctrl+D or `exit`), **Then** the sandbox remains running and can be reconnected with `sandctl console <name>`.

3. **Given** an interactive terminal, **When** user runs `sandctl new` and provisioning succeeds, **Then** the session name is displayed before console connection begins so the user knows what session they're connected to.

---

### User Story 2 - Skip Auto-Console Option (Priority: P2)

As a developer running automated scripts or CI pipelines, I want the option to skip the automatic console connection, so I can create sessions programmatically without blocking on an interactive session.

**Why this priority**: Supports automation use cases where the current behavior (create and exit) is preferred. Without this, users scripting with sandctl would lose functionality.

**Independent Test**: Run `sandctl new --no-console` and verify that after provisioning, the command exits with the session name printed (current behavior) without starting a console.

**Acceptance Scenarios**:

1. **Given** a terminal, **When** user runs `sandctl new --no-console`, **Then** the session is created and the command exits after printing the session name (current behavior).

2. **Given** a non-interactive environment (piped input), **When** user runs `sandctl new`, **Then** the system creates the session and exits without attempting console connection (auto-detects non-TTY).

---

### Edge Cases

- What happens when console connection fails after successful provisioning?
  - The session should remain created and usable. An error message should indicate the console connection failed and suggest running `sandctl console <name>` manually.

- What happens when the user's terminal loses connection during the console session?
  - Same as `sandctl console` behavior: the sandbox remains running and can be reconnected.

- What happens when `sandctl new` is run in a non-interactive environment (CI, piped input)?
  - The system should detect non-TTY stdin and behave as if `--no-console` was specified, avoiding blocking on console input.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After successful provisioning, the `new` command MUST automatically initiate a console session using the same mechanism as `sandctl console <name>`.

- **FR-002**: The session name MUST be displayed before the console connection begins so users know which session they are connected to.

- **FR-003**: The `new` command MUST support a `--no-console` flag that skips automatic console connection and reverts to current behavior (print session name and exit).

- **FR-004**: When stdin is not an interactive terminal, the `new` command MUST skip automatic console connection (equivalent to `--no-console`).

- **FR-005**: If console connection fails after successful provisioning, the session MUST remain created and running. An error message MUST inform the user how to connect manually.

- **FR-006**: When the user exits the console session, the sandbox MUST remain running (not be destroyed).

- **FR-007**: The provisioning progress output (spinner, step messages) MUST complete and be visible before console connection starts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create and connect to a new session with a single command (`sandctl new`), reducing the required commands from 2 to 1.

- **SC-002**: Time from running `sandctl new` to having an interactive shell is no longer than provisioning time plus 3 seconds for console connection.

- **SC-003**: 100% of non-interactive invocations (non-TTY stdin) complete without blocking, maintaining compatibility with scripts and automation.

- **SC-004**: Existing workflows using `sandctl new` in scripts continue to work when using the `--no-console` flag.

## Assumptions

- The `sandctl console` command infrastructure is already implemented and working (completed in feature 011-console-command).
- Terminal detection uses the same mechanism as the existing console command (`term.IsTerminal`).
- The sprite CLI wrapping and WebSocket fallback behaviors from console command apply here as well.
