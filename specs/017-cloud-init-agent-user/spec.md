# Feature Specification: Cloud-Init Agent User

**Feature Branch**: `017-cloud-init-agent-user`
**Created**: 2026-01-26
**Status**: Draft
**Input**: User description: "Let's work on improving our cloud-init script. I'd like to review all the tools that are currently installed and cut the list down if possible, so we aren't spending time installing tools that aren't actually needed. We should also create a non-root user called 'agent' and clone the repo into the agent's home directory instead of root. Whenever sshing into the VM, we should use the agent username instead of sshing as root."

## User Scenarios & Testing

### User Story 1 - Create VMs with Non-Root Agent User (Priority: P1)

As a developer using sandctl, I want VMs to be provisioned with a non-root "agent" user so that I can follow security best practices and avoid running as root by default.

**Why this priority**: Security is paramount. Running as root unnecessarily exposes the VM to accidental system damage and follows poor security practices. This is the core change that affects all subsequent behavior.

**Independent Test**: Create a new VM with `sandctl new` and verify SSH connects as the "agent" user, not root. The agent user should have a home directory at `/home/agent`.

**Acceptance Scenarios**:

1. **Given** sandctl is configured, **When** I run `sandctl new`, **Then** the VM is created with a non-root user named "agent" with a home directory at `/home/agent`
2. **Given** a VM has been created, **When** I run `sandctl console`, **Then** I am connected as the "agent" user, not root
3. **Given** the agent user exists, **When** I need elevated privileges, **Then** I can use sudo without a password (agent user has passwordless sudo)

---

### User Story 2 - Streamlined Tool Installation (Priority: P2)

As a developer, I want the VM provisioning to install essential utilities without language runtimes so that VMs start faster while still having the tools I need.

**Why this priority**: Removing language runtimes (nodejs, python) reduces installation time while keeping essential utilities (docker, git, curl, wget, jq, htop, vim) that are commonly needed.

**Independent Test**: Create a new VM and verify the expected tools are installed and language runtimes are not. Compare boot time with the previous setup.

**Acceptance Scenarios**:

1. **Given** sandctl is creating a new VM, **When** cloud-init runs, **Then** essential tools (docker, git, curl, wget, jq, htop, vim) are installed
2. **Given** a newly provisioned VM, **When** I check installed packages, **Then** nodejs, npm, python3, and pip are NOT pre-installed
3. **Given** the minimal setup completes, **When** I need additional tools (like nodejs or python), **Then** I can install them manually as needed

---

### User Story 3 - Repository Cloned to Agent Home Directory (Priority: P3)

As a developer cloning a repository during VM creation, I want the repository cloned into the agent user's home directory so that the agent user owns the files and can work with them directly.

**Why this priority**: This follows naturally from P1 (agent user creation) and ensures repositories are usable by the non-root user.

**Independent Test**: Create a VM with `sandctl new --repo <url>` and verify the repository is cloned to `/home/agent/<repo-name>` with proper ownership.

**Acceptance Scenarios**:

1. **Given** I run `sandctl new --repo https://github.com/user/repo`, **When** the VM is provisioned, **Then** the repository is cloned to `/home/agent/repo`
2. **Given** a repository has been cloned, **When** I check file ownership, **Then** all files are owned by the "agent" user
3. **Given** a repository has been cloned, **When** I connect via console, **Then** my working directory is `/home/agent` (or the cloned repo directory)

---

### Edge Cases

- What happens if SSH key injection fails? The VM should still be accessible via the cloud provider's console (out of scope for this change, but worth noting)
- What happens if the agent user already exists in the base image? The script should handle this gracefully (use `useradd` with appropriate flags)
- What happens if git clone fails? The script should continue (current behavior) and log the error

## Requirements

### Functional Requirements

- **FR-001**: System MUST create a non-root user named "agent" during VM provisioning
- **FR-002**: System MUST set the agent user's home directory to `/home/agent`
- **FR-003**: System MUST grant the agent user passwordless sudo access
- **FR-004**: System MUST copy the root user's authorized SSH keys to the agent user's `~/.ssh/authorized_keys`
- **FR-005**: System MUST change the default SSH user from "root" to "agent" for all SSH connections
- **FR-006**: System MUST install docker, git, curl, wget, jq, htop, and vim (removing nodejs, npm, python3, and pip from default installation)
- **FR-007**: System MUST clone repositories to `/home/agent/<repo-name>` when `--repo` flag is used
- **FR-008**: System MUST set proper ownership (agent:agent) on cloned repositories

### Key Entities

- **Agent User**: The non-root user account created on each VM. Has home directory at `/home/agent`, passwordless sudo access, and receives the SSH authorized keys.
- **Cloud-Init Script**: The bash script embedded in the VM creation request that configures the VM on first boot.

## Success Criteria

### Measurable Outcomes

- **SC-001**: VM provisioning time is reduced compared to current setup (due to fewer package installations)
- **SC-002**: All SSH connections use the "agent" user by default
- **SC-003**: Repositories are cloned with correct ownership (agent:agent)
- **SC-004**: The agent user can execute sudo commands without password prompt
- **SC-005**: Only 7 tools (docker, git, curl, wget, jq, htop, vim) are explicitly installed instead of the current 10+ tools (removing nodejs, npm, python3, pip)

## Assumptions

- The base Ubuntu 24.04 image does not have an existing "agent" user
- The cloud provider (Hetzner) injects SSH keys into the root user's authorized_keys file during VM creation
- Passwordless sudo is acceptable for this use case (development/agent VMs, not production servers)
- Docker, git, curl, wget, jq, htop, and vim are the baseline tools for agent workflows; language runtimes (nodejs, python) can be installed on-demand as needed

## Out of Scope

- Changing the VM image or cloud provider
- Adding new CLI flags for customizing the username
- Multi-user support or user management commands
- SSH key management beyond copying from root to agent
