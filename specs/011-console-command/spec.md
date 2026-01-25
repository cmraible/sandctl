# Feature Specification: Console Command

**Feature Branch**: `011-console-command`
**Created**: 2026-01-25
**Status**: Draft
**Input**: User description: "Create a new `sandctl console <name>` command, to start a console (similar to ssh, or may be ssh under the hood). The `sprite console -s <sprite-name>` command provides a better experience that is more akin to traditional ssh than the current `sandctl exec` command."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quick Console Access to Running Session (Priority: P1)

A developer wants to quickly connect to a running sandbox session with an interactive terminal to explore files, run commands, or debug their environment—similar to how they would SSH into a remote server.

**Why this priority**: This is the core functionality that directly addresses the user's need for SSH-like access. Without this, there is no feature.

**Independent Test**: Can be fully tested by running `sandctl console <session-name>` against a running session and verifying an interactive shell prompt appears that accepts and executes commands.

**Acceptance Scenarios**:

1. **Given** a running session named "alice", **When** user runs `sandctl console alice`, **Then** an interactive terminal session opens with a shell prompt where the user can type commands and see output.
2. **Given** an active console session, **When** user types `ls -la`, **Then** the directory listing is displayed with proper formatting and colors preserved.
3. **Given** an active console session, **When** user presses Ctrl+D or types `exit`, **Then** the console session ends gracefully and returns to the local terminal.

---

### User Story 2 - Handle Non-Running Sessions (Priority: P2)

A developer attempts to connect to a session that is not in a running state (provisioning, stopped, or failed). The system should provide clear feedback about the session's status.

**Why this priority**: Error handling is essential for a good user experience. Users need to understand why they cannot connect.

**Independent Test**: Can be tested by attempting `sandctl console <name>` against sessions in various non-running states and verifying appropriate error messages are displayed.

**Acceptance Scenarios**:

1. **Given** a session "bob" in "provisioning" state, **When** user runs `sandctl console bob`, **Then** the system displays a message indicating the session is still provisioning and suggests waiting or checking status.
2. **Given** a session "carol" in "stopped" state, **When** user runs `sandctl console carol`, **Then** the system displays a message indicating the session is stopped and suggests restarting it.
3. **Given** a session name "unknown" that does not exist, **When** user runs `sandctl console unknown`, **Then** the system displays an error indicating the session was not found.

---

### User Story 3 - Seamless Terminal Experience (Priority: P2)

A developer expects the console experience to feel like a native SSH connection with proper terminal handling including window resizing, special key combinations, and clean exit behavior.

**Why this priority**: A poor terminal experience undermines the value of the feature. Users expect parity with standard SSH behavior.

**Independent Test**: Can be tested by resizing the terminal window during an active console session and verifying the remote shell adapts to the new dimensions.

**Acceptance Scenarios**:

1. **Given** an active console session, **When** user resizes their terminal window, **Then** the remote shell adapts to the new terminal dimensions.
2. **Given** an active console session, **When** user presses Ctrl+C, **Then** the signal is sent to the remote process (not the local sandctl process).
3. **Given** an active console session that loses network connectivity, **When** the connection is interrupted, **Then** the console exits gracefully with an informative error message.

---

### Edge Cases

- What happens when the session becomes unavailable mid-console (e.g., timeout destroys the session)?
  - The console should detect the disconnection and exit with an informative message.
- How does the system handle non-terminal input (e.g., piped commands)?
  - When stdin is not a terminal, the system refuses to start and displays a helpful message directing the user to the `exec` command for non-interactive use cases.
- What happens if the user's terminal does not support raw mode?
  - The console should still function but may have degraded functionality, with a warning displayed to the user.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `console` command that accepts a session name as a positional argument.
- **FR-002**: System MUST establish an interactive terminal connection to the specified session's sprite.
- **FR-003**: System MUST validate that the session name exists in the local session store before attempting connection.
- **FR-004**: System MUST verify the session/sprite is in a "running" or "warm" state before connecting.
- **FR-005**: System MUST display the session status and appropriate guidance when attempting to connect to a non-running session.
- **FR-006**: System MUST handle terminal resizing events and propagate new dimensions to the remote session.
- **FR-007**: System MUST properly handle terminal signals (Ctrl+C should pass to remote, Ctrl+D exits session).
- **FR-008**: System MUST restore the local terminal state upon exit (whether clean exit or error).
- **FR-009**: System MUST provide clear feedback when the connection is established ("Connected to <name>") and when it ends.
- **FR-010**: System MUST handle connection errors gracefully with user-friendly error messages.
- **FR-011**: System MUST detect when stdin is not a terminal and refuse to start, displaying a message directing users to the `exec` command for non-interactive use.

### Key Entities

- **Session**: The local record of a sandbox environment, identified by a human-readable name (e.g., "alice"), with status tracking (provisioning, running, stopped, failed).
- **Sprite**: The remote sandbox instance hosted on the Fly.io Sprites platform, which the console command connects to.
- **Console Connection**: The interactive terminal session between the user's local terminal and the remote sprite.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can establish an interactive console session to a running sandbox within 3 seconds of command execution.
- **SC-002**: Terminal output appears with no perceivable latency (sub-100ms round trip) under normal network conditions.
- **SC-003**: 100% of terminal control characters (colors, cursor movement, special keys) are correctly transmitted between local and remote terminals.
- **SC-004**: Users can resize their terminal window and see the remote shell adapt within 1 second.
- **SC-005**: When a connection fails or is interrupted, users receive a clear error message within 5 seconds.
- **SC-006**: The local terminal is correctly restored to its original state 100% of the time after console exit (no corrupted terminal state).

## Clarifications

### Session 2026-01-25

- Q: How should the system handle non-terminal input (e.g., piped commands)? → A: Refuse with helpful message pointing to `exec` command

## Assumptions

- The Sprites API provides a mechanism for interactive terminal access (WebSocket-based or similar) that can be leveraged by the console command.
- The existing `exec` command's interactive session implementation provides a working foundation for the console command.
- Users have a terminal that supports raw mode for optimal experience (with graceful degradation for terminals that don't).
- The default shell on the sprite is bash or a similar POSIX-compliant shell.
