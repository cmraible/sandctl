# Feature Specification: Pluggable VM Providers

**Feature Branch**: `015-pluggable-vm-providers`
**Created**: 2026-01-25
**Status**: Draft
**Input**: User description: "Switch from Fly.io sprites to pluggable VM providers (Hetzner, AWS, GCP) for sandboxed AI agent environments with full tooling support"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a Sandbox with Hetzner Provider (Priority: P1)

As a developer, I want to create a sandboxed VM environment using Hetzner Cloud so that I can run AI agents with full access to standard Ubuntu tooling like Docker and Playwright.

**Why this priority**: This is the core functionality - users need to be able to provision VMs with a provider that offers standard Ubuntu images. Without this, the tool has no primary use case.

**Independent Test**: Can be fully tested by running `sandctl new` with Hetzner configured, SSHing into the resulting VM, and verifying Docker and other tools work correctly.

**Acceptance Scenarios**:

1. **Given** I have configured sandctl with Hetzner credentials, **When** I run `sandctl new`, **Then** a new Hetzner VM is provisioned with a standard Ubuntu image and I can connect to it.
2. **Given** I have a running Hetzner VM, **When** I install Playwright using `yarn playwright install`, **Then** the installation completes successfully without OS compatibility errors.
3. **Given** I have a running Hetzner VM, **When** I run `docker run hello-world`, **Then** Docker executes successfully.

---

### User Story 2 - Switch Between VM Providers (Priority: P2)

As a developer, I want to configure which cloud provider sandctl uses so that I can choose the provider that best fits my needs (cost, region, performance).

**Why this priority**: Provider flexibility is essential for users to optimize for their specific requirements, but requires the core provisioning (P1) to work first.

**Independent Test**: Can be tested by configuring different providers in the config file and verifying that `sandctl new` provisions VMs with the correct provider.

**Acceptance Scenarios**:

1. **Given** I have credentials for multiple providers configured, **When** I set `default_provider: hetzner` in my config, **Then** `sandctl new` provisions a Hetzner VM.
2. **Given** I have Hetzner as my default provider, **When** I run `sandctl new --provider gcp`, **Then** a GCP VM is provisioned instead.
3. **Given** I specify an unconfigured provider, **When** I run `sandctl new --provider aws`, **Then** I receive a clear error message indicating AWS credentials are not configured.

---

### User Story 3 - Manage VM Lifecycle Across Providers (Priority: P2)

As a developer, I want sandctl commands (list, console, exec, destroy) to work seamlessly regardless of which provider created the VM.

**Why this priority**: Users need consistent management commands across all their VMs, regardless of provider origin.

**Independent Test**: Can be tested by creating VMs with different providers, then using `sandctl list`, `sandctl console`, and `sandctl destroy` on each.

**Acceptance Scenarios**:

1. **Given** I have VMs running on both Hetzner and GCP, **When** I run `sandctl list`, **Then** I see all VMs with their provider indicated.
2. **Given** I have a running Hetzner VM named "bright-panda", **When** I run `sandctl console bright-panda`, **Then** I get an interactive terminal session.
3. **Given** I have a running GCP VM named "swift-tiger", **When** I run `sandctl destroy swift-tiger`, **Then** the VM is terminated and removed from my session list.

---

### User Story 4 - Configure Provider-Specific Settings (Priority: P3)

As a developer, I want to configure provider-specific options like VM size, region, and image so that I can customize the sandbox environment to my needs.

**Why this priority**: Advanced configuration options are important but not blocking for basic usage.

**Independent Test**: Can be tested by setting provider-specific options in config and verifying the provisioned VM matches those settings.

**Acceptance Scenarios**:

1. **Given** I have configured `hetzner.server_type: cx21` in my config, **When** I run `sandctl new`, **Then** the Hetzner VM is created with the cx21 server type.
2. **Given** I want to provision in a specific region, **When** I run `sandctl new --region eu-central`, **Then** the VM is created in that region.
3. **Given** I want to use a specific Ubuntu version, **When** I configure `hetzner.image: ubuntu-24.04`, **Then** new VMs use Ubuntu 24.04.

---

### Edge Cases

- What happens when provider API credentials expire or are invalid? → Display clear error message prompting user to update credentials via `sandctl init`.
- How does the system handle provider rate limits or quota exceeded errors? → Display provider-specific error with retry guidance.
- What happens if a VM provisioning times out? → Mark session as failed, display error, user can retry or destroy.
- Orphaned VMs (local session deleted but VM still running) → Auto-detected and reconciled on every `sandctl list` via provider API sync.
- What happens when switching default provider with existing sessions from another provider? → Existing sessions remain accessible; each session tracks its own provider.
- How does the system handle provider-specific features that don't exist on other providers? → Provider interface exposes only common capabilities; provider-specific features configured via provider config section.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define a provider interface that abstracts VM lifecycle operations (create, get, delete, list, execute command, interactive session).
- **FR-002**: System MUST implement the Hetzner Cloud provider as the initial provider implementation.
- **FR-003**: System MUST support configuring multiple provider credentials in the config file.
- **FR-004**: System MUST allow users to set a default provider in their configuration.
- **FR-005**: System MUST allow users to override the default provider per-command using a `--provider` flag.
- **FR-006**: System MUST provision VMs with a standard Ubuntu image (22.04 or 24.04) that supports common developer tools.
- **FR-007**: System MUST store provider information with each session so commands work correctly regardless of which provider created the VM.
- **FR-008**: System MUST install Docker on provisioned VMs as part of the setup process.
- **FR-009**: System MUST provide SSH-based console access to VMs (using standard SSH, not provider-specific protocols).
- **FR-010**: System MUST clean up cloud resources when `sandctl destroy` is called.
- **FR-011**: System MUST display the provider name when listing sessions.
- **FR-012**: System MUST support provider-specific configuration options (server type/size, region, image).
- **FR-013**: System MUST validate provider credentials during `sandctl init` or on first use.
- **FR-014**: System MUST handle provider API errors gracefully with user-friendly error messages.
- **FR-015**: System MUST support command execution on VMs via SSH.
- **FR-016**: System MUST allow users to configure an SSH public key path in config, which is uploaded to VMs during provisioning.
- **FR-017**: System MUST auto-sync with provider APIs on `sandctl list` to reconcile local session state with actual cloud resources, detecting orphaned or externally-deleted VMs.

### Key Entities

- **Provider**: Represents a cloud provider implementation (e.g., Hetzner, GCP, AWS). Contains credentials, default configuration, and implements the provider interface.
- **VM**: Represents a provisioned virtual machine. Contains provider-agnostic fields (ID, name, status, IP address, created time) plus provider-specific metadata.
- **Session**: Extended from current implementation to include provider identifier and VM connection details (IP address, SSH key).
- **ProviderConfig**: Provider-specific configuration including credentials, default region, default server type/size, and default image. For Hetzner: default server type is CPX31 (4 vCPU, 8GB RAM), default region is ash (Ashburn, VA, USA).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can provision a new sandbox VM and connect to it within 5 minutes of running `sandctl new`.
- **SC-002**: Standard developer tools (Docker, Git, Node.js, Python) are available and functional on provisioned VMs without additional configuration.
- **SC-003**: Playwright installation (`yarn playwright install`) succeeds on provisioned VMs.
- **SC-004**: All existing sandctl commands (new, list, console, exec, destroy) work with the new provider system.
- **SC-005**: Adding a new provider implementation requires only implementing the provider interface, with no changes to CLI command code.
- **SC-006**: Users can switch between providers by changing a single configuration value.
- **SC-007**: Session data persists correctly across sandctl invocations, including provider information.

## Clarifications

### Session 2026-01-25

- Q: SSH key management strategy? → A: User provides existing SSH key path in config (e.g., `~/.ssh/id_rsa.pub`)
- Q: Migration strategy from Fly.io sprites? → A: Clean break: remove sprites entirely, existing sprite sessions become invalid
- Q: Default Hetzner server type? → A: CPX31 (4 vCPU, 8GB RAM, ~€15/mo)
- Q: Orphaned VM handling? → A: Auto-sync on every `sandctl list`: query provider API and reconcile local state
- Q: Default Hetzner region? → A: ash (Ashburn, Virginia, USA)

## Assumptions

- Users will provide their own cloud provider API credentials (Hetzner API token, etc.).
- Users have basic familiarity with cloud provider concepts (regions, server sizes).
- Users will configure an existing SSH public key path in sandctl config; sandctl will upload this key to provisioned VMs for SSH access.
- The initial Hetzner implementation will inform the interface design, but the interface should be general enough for other providers.
- VM provisioning cost and billing is the user's responsibility.
- Internet connectivity is available for API calls and package installation.
- Ubuntu LTS versions (22.04 or 24.04) are the target operating systems for VMs.
- This is a breaking change: existing Fly.io sprite sessions will no longer work after upgrade. Users should destroy sprites before upgrading.
- Default Hetzner server type is CPX31 (4 vCPU, 8GB RAM) to ensure adequate resources for Docker and Playwright workloads.
- Default Hetzner region is ash (Ashburn, Virginia, USA).

## Out of Scope

- Automatic cost optimization or provider selection based on pricing.
- Multi-region or multi-VM orchestration within a single session.
- Persistent storage or volume management across VM restarts.
- Container-based sandboxes (Docker, Podman) as an alternative to VMs.
- Windows or non-Linux VM support.
- Automatic credential rotation or secrets management.
- Provider-specific advanced features (load balancers, networking, etc.).
- Fly.io sprites support (completely removed; this is a breaking change).
- Migration tooling for existing sprite-based sessions.
