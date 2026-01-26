# Feature Specification: SSH Agent Support

**Feature Branch**: `016-ssh-agent-support`
**Created**: 2026-01-26
**Status**: Draft
**Input**: User description: "I don't generally keep my ssh keys stored on my disk directly in the ~/.ssh directory. Instead I use the 1password CLI and ssh agent. When I run sandctl init, it prompts for the ssh key and fails because it doesn't exist. Can you update the spec so it supports using my ssh agent instead of requiring an ssh key in the ~/.ssh directory?"

## Clarifications

### Session 2026-01-26

- Q: How should the SSH key source selection be presented in interactive mode? → A: Auto-detect agent availability and pre-select "SSH Agent" if keys found, with "File path" as alternative option.
- Q: How should SSH public keys from the agent be stored in configuration? → A: Store both inline public key content (for provisioning) and fingerprint (for re-matching with agent at connection time).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure sandctl with SSH Agent Keys (Priority: P1)

As a user who manages SSH keys through an SSH agent (like 1Password), I want to configure sandctl without needing a public key file on disk, so that I can use my existing secure key management workflow.

**Why this priority**: This is the core use case that enables users with modern SSH key management (1Password, GPG agent, etc.) to use sandctl at all. Without this, these users cannot complete initial setup.

**Independent Test**: Can be fully tested by running `sandctl init`, selecting SSH agent mode, and verifying that configuration completes successfully and the public key is retrieved from the agent.

**Acceptance Scenarios**:

1. **Given** I have SSH keys loaded in my SSH agent (e.g., 1Password), **When** I run `sandctl init`, **Then** the system auto-detects the agent, pre-selects "SSH Agent" as the key source, and shows "File path" as an alternative option.

2. **Given** I select the SSH agent option during init, **When** the agent has one or more keys available, **Then** sandctl retrieves the public key from the agent and stores it in the configuration.

3. **Given** I select the SSH agent option during init, **When** the agent has multiple keys available, **Then** I can select which key to use from a list showing key fingerprints/comments.

---

### User Story 2 - Non-Interactive SSH Agent Configuration (Priority: P2)

As a user automating sandctl setup in scripts or CI, I want to configure sandctl to use SSH agent via command-line flags, so that I can automate my infrastructure provisioning.

**Why this priority**: Enables automation and scripting use cases for users who want to use SSH agent in non-interactive contexts.

**Independent Test**: Can be tested by running `sandctl init --ssh-agent` in a CI environment with SSH_AUTH_SOCK set and verifying the command succeeds.

**Acceptance Scenarios**:

1. **Given** I have SSH keys loaded in my SSH agent, **When** I run `sandctl init --hetzner-token TOKEN --ssh-agent`, **Then** sandctl uses the first available key from the agent and completes successfully.

2. **Given** I have SSH keys loaded in my SSH agent, **When** I run `sandctl init --hetzner-token TOKEN --ssh-agent --ssh-key-fingerprint FINGERPRINT`, **Then** sandctl uses the specified key from the agent.

---

### User Story 3 - Graceful Fallback and Error Handling (Priority: P3)

As a user, I want clear error messages when SSH agent configuration fails, so that I can troubleshoot and resolve issues.

**Why this priority**: Good error handling improves user experience and reduces support burden, but users can still complete setup via the traditional key file path if agent setup fails.

**Independent Test**: Can be tested by running `sandctl init` with no SSH agent available and verifying appropriate error messages are shown.

**Acceptance Scenarios**:

1. **Given** I select the SSH agent option, **When** no SSH agent is available (SSH_AUTH_SOCK not set or socket unreachable), **Then** I receive a clear error message explaining the issue and suggesting alternatives.

2. **Given** I select the SSH agent option, **When** the agent has no keys loaded, **Then** I receive a clear error message and am offered the option to specify a key file path instead.

---

### Edge Cases

- What happens when the SSH agent becomes unavailable after initial configuration? The system should attempt to reconnect to the agent at VM creation time and provide actionable error messages if the agent is unavailable.
- What happens if a user has both SSH agent keys and local key files? The system should allow users to choose their preferred method during init, defaulting to suggesting SSH agent if detected.
- What happens with 1Password's specific agent socket path? The system should check common agent socket locations including 1Password's custom path (`~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock` on macOS).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect available SSH agent sockets (SSH_AUTH_SOCK, 1Password socket, IdentityAgent from ~/.ssh/config)
- **FR-002**: System MUST auto-detect SSH agent availability during interactive init and pre-select "SSH Agent" when keys are found, while offering "File path" as an alternative
- **FR-003**: System MUST retrieve and display available public keys from the SSH agent for user selection
- **FR-004**: System MUST store both the public key content (for VM provisioning) and the key fingerprint (for agent re-matching at connection time) when using SSH agent mode
- **FR-005**: System MUST provide a `--ssh-agent` flag for non-interactive init mode
- **FR-006**: System MUST provide a `--ssh-key-fingerprint` flag to select a specific key from the agent in non-interactive mode
- **FR-007**: System MUST provide clear error messages when SSH agent is unavailable or has no keys
- **FR-008**: System MUST continue to support the existing SSH public key file path option
- **FR-009**: System MUST validate that the selected key from the agent can be used for signing (not just retrieved)

### Key Entities

- **SSH Agent**: External service (1Password, ssh-agent, gpg-agent) that holds private keys and provides signing operations
- **SSH Public Key**: The public portion of an SSH key pair, retrieved from agent or file, stored in configuration for VM provisioning
- **Configuration**: The sandctl config file (~/.sandctl/config) which stores either a key file path, or for agent mode: the public key content (for provisioning) plus fingerprint (for agent re-matching)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users with 1Password SSH agent can complete `sandctl init` without creating local key files
- **SC-002**: Users can select from multiple SSH agent keys when more than one is available
- **SC-003**: Non-interactive setup works with SSH agent via `--ssh-agent` flag
- **SC-004**: Clear, actionable error messages guide users when SSH agent setup fails
- **SC-005**: Existing users with local key files experience no change in behavior

## Assumptions

- Users with SSH agents have the agent running and accessible via standard socket paths (SSH_AUTH_SOCK, 1Password socket, or IdentityAgent config)
- The SSH agent implements the standard SSH agent protocol for key listing and signing
- Public keys can be retrieved from the agent without requiring user interaction (beyond any unlock prompt the agent itself may show)
- The configuration file format can be extended to store public key content in addition to or instead of a file path
