# Feature Specification: Human-Readable Sandbox Names

**Feature Branch**: `003-human-readable-names`
**Created**: 2026-01-22
**Status**: Draft
**Input**: User description: "The name of the sandboxes should be randomly generated human first names, without any numeric portion, so it's easier to run e.g. sandctl list and sandctl destroy <name> without having to copy/paste"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Easy Sandbox Identification (Priority: P1)

As a developer using sandctl, I want my sandboxes to have memorable human names so I can easily type them from memory when running commands like `sandctl destroy` or `sandctl exec`.

**Why this priority**: This is the core value proposition - eliminating the need to copy/paste cryptic IDs dramatically improves daily workflow efficiency.

**Independent Test**: Can be fully tested by creating a sandbox and verifying the name is a recognizable human first name that can be typed from memory.

**Acceptance Scenarios**:

1. **Given** I run `sandctl start --prompt "Build an app"`, **When** the sandbox is created, **Then** the assigned name is a human first name (e.g., "alice", "marcus", "sofia") with no numeric suffix.

2. **Given** I have a running sandbox named "marcus", **When** I run `sandctl destroy marcus`, **Then** the sandbox is destroyed without needing to copy/paste any ID.

3. **Given** I have multiple sandboxes running, **When** I run `sandctl list`, **Then** I see human names that are easy to distinguish and remember.

---

### User Story 2 - Name Collision Handling (Priority: P2)

As a developer running multiple sandboxes, I want the system to handle potential name collisions gracefully so I always get a unique, usable name.

**Why this priority**: Essential for reliability when running multiple concurrent sandboxes, but secondary to the core naming experience.

**Independent Test**: Can be tested by creating multiple sandboxes and verifying each receives a unique name.

**Acceptance Scenarios**:

1. **Given** I already have a sandbox named "alice", **When** I create a new sandbox and the system would have selected "alice", **Then** the system selects a different available name.

2. **Given** I have many active sandboxes, **When** I create another sandbox, **Then** I receive a unique human name that doesn't conflict with any existing sandbox.

---

### User Story 3 - Name Persistence Across Commands (Priority: P3)

As a developer, I want the human-readable name to work consistently across all sandctl commands so I can use the same name everywhere.

**Why this priority**: Important for consistent UX, but builds on top of the naming foundation.

**Independent Test**: Can be tested by using the same human name across `list`, `exec`, and `destroy` commands.

**Acceptance Scenarios**:

1. **Given** a sandbox named "sofia" exists, **When** I run `sandctl exec sofia`, **Then** I connect to that specific sandbox.

2. **Given** a sandbox named "sofia" exists, **When** I run `sandctl list`, **Then** "sofia" appears in the output and can be used with other commands.

---

### Edge Cases

- What happens when all names in the pool are in use? The system selects from a secondary pool or notifies the user to destroy unused sandboxes.
- How does the system handle rapid consecutive sandbox creation? Each creation results in a unique name through atomic name reservation.
- What if a sandbox is destroyed and quickly recreated? The previously used name becomes available immediately after destruction.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate sandbox names from a pool of common human first names.
- **FR-002**: System MUST ensure each active sandbox has a unique name.
- **FR-003**: Sandbox names MUST NOT contain numeric portions, hyphens, or other non-alphabetic characters.
- **FR-004**: Sandbox names MUST be case-insensitive for all commands (e.g., "Alice", "alice", "ALICE" all refer to the same sandbox).
- **FR-005**: System MUST release a name back to the available pool when a sandbox is destroyed.
- **FR-006**: System MUST select names randomly to avoid predictable sequences.
- **FR-007**: System MUST maintain a sufficiently large name pool to support typical usage (multiple concurrent sandboxes per user).

### Key Entities

- **Name Pool**: A curated list of common human first names used for random selection.
- **Active Name Registry**: Tracks which names are currently in use by active sandboxes to prevent collisions.
- **Sandbox Session**: Existing entity, now associated with a human-readable name instead of a hex-based ID.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can type sandbox names from memory without referring to command output 90% of the time.
- **SC-002**: Sandbox names are immediately recognizable as human names by users.
- **SC-003**: Users can manage sandboxes (list, exec, destroy) using only the human-readable name.
- **SC-004**: Name collisions are avoided for users running up to 20 concurrent sandboxes.
- **SC-005**: Time to type a sandbox name is reduced compared to typing/pasting an 8-character hex string.

## Assumptions

- Users typically run fewer than 20 concurrent sandboxes.
- A pool of 200+ common first names provides sufficient variety for typical usage patterns.
- Names will be stored in lowercase for consistency, regardless of how the user types them.
- The existing session store can be adapted to use human names as the primary identifier.
- Names are unique per user account, not globally unique across all users.
