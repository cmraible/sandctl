# Feature Specification: Sandbox CLI

**Feature Branch**: `001-sandbox-cli`
**Created**: 2026-01-22
**Status**: Draft
**Input**: User description: "CLI for managing sandboxed AI web development agents with start, list, exec, and destroy commands"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a New Agent Session (Priority: P1)

A developer wants to quickly spin up an isolated environment where an AI coding agent can work on a web development task without affecting their local system. They run a single command with their prompt, and the system provisions a VM, installs tools, and starts the agent working.

**Why this priority**: This is the core value proposition - without the ability to start sandboxed agents, the tool has no purpose. This must work first.

**Independent Test**: Can be fully tested by running `sandctl start` with a prompt and verifying a VM is created with the agent running. Delivers immediate value as a standalone feature.

**Acceptance Scenarios**:

1. **Given** no active VMs exist, **When** user runs `sandctl start --prompt "Create a React todo app"`, **Then** system provisions a new VM, installs development tools and the default agent, starts the agent with the prompt, and displays the VM identifier.

2. **Given** the user has not specified an agent, **When** user runs `sandctl start --prompt "Build an API"`, **Then** system uses the default agent (claude) and displays which agent was selected.

3. **Given** the user wants a specific agent, **When** user runs `sandctl start --agent opencode --prompt "Create a landing page"`, **Then** system provisions VM with the specified agent installed and running.

4. **Given** the provisioning process is underway, **When** user is waiting, **Then** system displays progress feedback indicating current step (provisioning VM, installing tools, starting agent).

---

### User Story 2 - List Active Sessions (Priority: P2)

A developer who has started multiple sandboxed agent sessions needs to see what's currently running to manage resources and check on progress.

**Why this priority**: After starting sessions, users need visibility into what's running. Essential for resource management but depends on having sessions to list.

**Independent Test**: Can be tested by starting one or more VMs, then running `sandctl list` and verifying output shows all active sessions with relevant details.

**Acceptance Scenarios**:

1. **Given** multiple VMs are running, **When** user runs `sandctl list`, **Then** system displays a table showing each VM's identifier, agent type, creation time, and status.

2. **Given** no VMs are running, **When** user runs `sandctl list`, **Then** system displays a message indicating no active sessions exist.

3. **Given** VMs are in various states, **When** user runs `sandctl list`, **Then** system shows accurate status for each (running, stopped, provisioning).

---

### User Story 3 - Connect to a Session (Priority: P3)

A developer needs to inspect what's happening inside a sandboxed environment, check on agent progress, or manually intervene in the development process.

**Why this priority**: Enables debugging and manual intervention. Important for power users but not required for basic automated agent workflows.

**Independent Test**: Can be tested by starting a VM, running `sandctl exec <id>`, and verifying an interactive shell session opens inside the VM.

**Acceptance Scenarios**:

1. **Given** a VM with identifier "abc123" is running, **When** user runs `sandctl exec abc123`, **Then** system opens an interactive shell session inside that VM.

2. **Given** a VM identifier that doesn't exist, **When** user runs `sandctl exec invalid-id`, **Then** system displays an error message indicating the VM was not found.

3. **Given** a VM that is not in running state, **When** user runs `sandctl exec <stopped-vm-id>`, **Then** system displays an appropriate error message.

---

### User Story 4 - Destroy a Session (Priority: P4)

A developer has finished with a sandboxed environment and wants to clean up resources by removing the VM entirely.

**Why this priority**: Resource cleanup is important but typically happens after the core workflow (start, observe, interact) is complete.

**Independent Test**: Can be tested by creating a VM, running `sandctl destroy <id>`, and verifying the VM no longer appears in `sandctl list`.

**Acceptance Scenarios**:

1. **Given** a VM with identifier "abc123" exists, **When** user runs `sandctl destroy abc123`, **Then** system terminates and removes the VM, confirming deletion.

2. **Given** a VM identifier that doesn't exist, **When** user runs `sandctl destroy invalid-id`, **Then** system displays an error message indicating the VM was not found.

3. **Given** user wants to destroy without confirmation, **When** user runs `sandctl destroy abc123 --force`, **Then** system destroys immediately without prompting.

4. **Given** user runs destroy without --force, **When** prompted for confirmation, **Then** user must confirm before VM is deleted.

---

### Edge Cases

- What happens when VM provisioning fails mid-process? System should clean up partial resources and report clear error.
- What happens when the cloud provider is unreachable? System should fail gracefully with actionable error message.
- What happens when user tries to start more VMs than their quota allows? System should report quota limit clearly.
- How does the system handle network interruption during `exec` session? Session should terminate gracefully, VM remains unaffected.
- What happens if the agent crashes inside the VM? VM continues running; user can `exec` in to investigate.
- What if the agent cannot push to git remote? Agent reports error; user can `exec` in to configure credentials or push manually.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provision isolated VM environments using Fly.io Sprites via `sandctl start` command.
- **FR-002**: System MUST install development tools (git, node, python, common build tools) in provisioned VMs.
- **FR-003**: System MUST support installing and running multiple agent types: claude, opencode, and codex.
- **FR-004**: System MUST accept a user-provided prompt to pass to the agent on startup.
- **FR-004a**: System MUST read agent API keys from ~/.sandctl/config and inject them into the VM at start time.
- **FR-005**: System MUST generate unique identifiers for each VM session.
- **FR-006**: System MUST display provisioning progress to the user during `start` command.
- **FR-007**: System MUST list all active VM sessions with `sandctl list` command showing identifier, agent type, creation time, and status.
- **FR-008**: System MUST provide interactive shell access to running VMs via `sandctl exec <id>` command.
- **FR-009**: System MUST terminate and remove VMs via `sandctl destroy <id>` command.
- **FR-010**: System MUST prompt for confirmation before destroying a VM unless `--force` flag is provided.
- **FR-011**: System MUST display clear error messages when operations fail, including actionable guidance.
- **FR-012**: System MUST clean up resources if provisioning fails partway through.
- **FR-013**: System MUST support an optional `--timeout` flag on `start` to auto-destroy the VM after specified duration. No timeout by default.

### Key Entities

- **VM Session**: Represents a sandboxed environment instance. Attributes: unique identifier, agent type, creation timestamp, current status (provisioning, running, stopped, failed), associated prompt.
- **Agent**: The AI coding assistant running inside the VM. Types: claude, opencode, codex. Has configuration for how to start with a given prompt.
- **Development Environment**: The toolset installed in each VM. Includes version control, package managers, language runtimes, and build tools.

## Clarifications

### Session 2026-01-22

- Q: Which VM provider should be used for provisioning? → A: Fly.io Sprites
- Q: How do users retrieve agent work products? → A: Push to git remote from within VM (user configures repo in prompt)
- Q: How are agent API keys provided to the VM? → A: Store in local config file (~/.sandctl/config) and inject at start
- Q: Do sessions have automatic timeouts? → A: No timeout by default, optionally set via --timeout flag

## Assumptions

- Users have credentials configured for Fly.io (FLY_API_TOKEN environment variable or `fly auth login`).
- The default agent is "claude" when not specified.
- VMs are Linux-based environments.
- Network connectivity is required for all operations.
- Agent installation is handled via standard package managers or official installers.
- Session data (prompts, identifiers) is stored locally on the user's machine.
- Agent API keys are stored in ~/.sandctl/config and injected into VMs at start time.
- Users retrieve agent work products by having the agent push to a git remote (configured via prompt or environment). No dedicated file retrieval command is provided.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can provision a new sandboxed agent environment in under 3 minutes from command execution.
- **SC-002**: Users can list all active sessions and see accurate status information within 5 seconds.
- **SC-003**: Users can connect to a running session within 10 seconds of running the exec command.
- **SC-004**: Users can destroy a session and have resources fully cleaned up within 1 minute.
- **SC-005**: 95% of first-time users successfully start an agent session without consulting documentation beyond `--help`.
- **SC-006**: All error conditions result in user-friendly messages with clear next steps.
