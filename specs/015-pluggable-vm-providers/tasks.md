# Tasks: Pluggable VM Providers

**Input**: Design documents from `/specs/015-pluggable-vm-providers/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Project structure**: Go CLI at repository root
- **Source**: `internal/` for packages, `cmd/sandctl/` for entry point
- **Tests**: `tests/e2e/` for E2E tests, `*_test.go` alongside source for unit tests

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add new dependencies and create package structure

- [X] T001 Add hcloud-go SDK dependency: `go get github.com/hetznercloud/hcloud-go/v2/hcloud`
- [X] T002 Add SSH library dependency: `go get golang.org/x/crypto/ssh`
- [X] T003 [P] Create internal/provider/ package directory structure
- [X] T004 [P] Create internal/hetzner/ package directory structure
- [X] T005 [P] Create internal/sshexec/ package directory structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Provider Interface & Types

- [X] T006 Define provider error types in internal/provider/errors.go (ErrNotFound, ErrAuthFailed, ErrQuotaExceeded, ErrProvisionFailed, ErrTimeout)
- [X] T007 Define VMStatus constants and VM struct in internal/provider/types.go
- [X] T008 Define CreateOpts struct in internal/provider/types.go
- [X] T009 Define Provider interface in internal/provider/interface.go (Name, Create, Get, Delete, List, WaitReady methods)
- [X] T010 Define SSHKeyManager interface in internal/provider/interface.go
- [X] T011 Implement provider registry with Get function in internal/provider/registry.go

### Extended Config Structure

- [X] T012 Add ProviderConfig struct (token, region, server_type, image, ssh_key_id) in internal/config/config.go
- [X] T013 Add new Config fields (default_provider, ssh_public_key, providers map) in internal/config/config.go
- [X] T014 Implement config validation (default_provider exists, ssh_public_key readable, at least one provider) in internal/config/config.go
- [X] T015 Add config migration detection (old sprites_token format) in internal/config/config.go

### Extended Session Structure

- [X] T016 Add Provider, ProviderID, IPAddress fields to Session struct in internal/session/types.go
- [X] T017 Add validation for new session fields (provider required, ip_address for running status) in internal/session/types.go

### SSH Execution Layer

- [X] T018 Implement SSH client wrapper with key authentication in internal/sshexec/client.go
- [X] T019 [P] Implement command execution via SSH in internal/sshexec/exec.go
- [X] T020 [P] Implement interactive terminal via SSH in internal/sshexec/console.go

### Remove Sprites

- [X] T021 Delete internal/sprites/ directory entirely

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Create Sandbox with Hetzner (Priority: P1) 🎯 MVP

**Goal**: Users can create a sandboxed VM on Hetzner Cloud with Docker pre-installed

**Independent Test**: Run `sandctl new` with Hetzner configured, SSH into VM, verify `docker run hello-world` works

### Hetzner Provider Implementation

- [X] T022 [US1] Implement Hetzner SDK wrapper with client initialization in internal/hetzner/client.go
- [X] T023 [US1] Implement SSH key management (EnsureSSHKey with fingerprint matching) in internal/hetzner/ssh_keys.go
- [X] T024 [US1] Define cloud-init setup script for Docker/Git/Node/Python in internal/hetzner/setup.go
- [X] T025 [US1] Implement Create method (server creation with user-data) in internal/hetzner/provider.go
- [X] T026 [US1] Implement Get method (retrieve server by ID) in internal/hetzner/provider.go
- [X] T027 [US1] Implement WaitReady method (poll until SSH ready) in internal/hetzner/provider.go
- [X] T028 [US1] Implement Delete method in internal/hetzner/provider.go
- [X] T029 [US1] Implement List method in internal/hetzner/provider.go
- [X] T030 [US1] Implement Name method and NewHetznerProvider factory in internal/hetzner/provider.go
- [X] T031 [US1] Register Hetzner provider in internal/provider/registry.go

### CLI Updates for sandctl new

- [X] T032 [US1] Update root.go to replace sprites client with provider getter in internal/cli/root.go
- [X] T033 [US1] Update init command to prompt for Hetzner token, SSH key path, region, server_type in internal/cli/init.go
- [X] T034 [US1] Rewrite new command to use provider interface (create VM, wait ready, save session with provider info) in internal/cli/new.go
- [X] T035 [US1] Update console command to use sshexec instead of sprites in internal/cli/console.go
- [X] T036 [US1] Update exec command to use sshexec instead of sprites in internal/cli/exec.go
- [X] T037 [US1] Update destroy command to use provider.Delete in internal/cli/destroy.go

**Checkpoint**: At this point, `sandctl new` creates a Hetzner VM and `sandctl console` connects via SSH

---

## Phase 4: User Story 2 - Switch Between Providers (Priority: P2)

**Goal**: Users can configure and select different providers via config or --provider flag

**Independent Test**: Set default_provider in config, verify `sandctl new` uses correct provider

**Note**: This story prepares the framework for multiple providers but only Hetzner is implemented. The --provider flag with non-Hetzner values will return "provider not configured" error.

### Provider Selection

- [ ] T038 [US2] Add --provider flag to new command in internal/cli/new.go
- [ ] T039 [US2] Implement provider selection logic (flag overrides default_provider) in internal/cli/new.go
- [ ] T040 [US2] Add clear error message for unconfigured provider in internal/cli/new.go
- [ ] T041 [US2] Update init command to support multiple provider configurations in internal/cli/init.go

**Checkpoint**: Users can use `--provider` flag and configure default provider

---

## Phase 5: User Story 3 - VM Lifecycle Management (Priority: P2)

**Goal**: All lifecycle commands (list, console, exec, destroy) work with provider-tracked sessions

**Independent Test**: Create VM, run `sandctl list` (shows provider column), `sandctl exec` runs command, `sandctl destroy` removes VM

### List Command with Provider Sync

- [ ] T042 [US3] Implement provider API sync in list command (for each provider, call List and reconcile) in internal/cli/list.go
- [ ] T043 [US3] Add provider column to list output in internal/cli/list.go
- [ ] T044 [US3] Handle orphaned VMs (VMs in provider not in local sessions) in internal/cli/list.go
- [ ] T045 [US3] Handle deleted VMs (sessions where VM no longer exists) in internal/cli/list.go

### Session-Provider Routing

- [ ] T046 [US3] Implement provider lookup from session.Provider field in internal/cli/root.go
- [ ] T047 [US3] Update console command to get provider from session, then connect via SSH in internal/cli/console.go
- [ ] T048 [US3] Update exec command to get provider from session, then execute via SSH in internal/cli/exec.go
- [ ] T049 [US3] Update destroy command to get provider from session, then call provider.Delete in internal/cli/destroy.go

**Checkpoint**: All lifecycle commands work regardless of which provider created the VM

---

## Phase 6: User Story 4 - Provider-Specific Settings (Priority: P3)

**Goal**: Users can configure server type, region, and image per provider

**Independent Test**: Set `hetzner.server_type: cpx21` in config, verify new VM uses that type

### Config Options

- [ ] T050 [US4] Add --region flag to new command in internal/cli/new.go
- [ ] T051 [US4] Add --server-type flag to new command in internal/cli/new.go
- [ ] T052 [US4] Add --image flag to new command in internal/cli/new.go
- [ ] T053 [US4] Pass override options to CreateOpts when calling provider.Create in internal/cli/new.go
- [ ] T054 [US4] Use config defaults (region, server_type, image) when flags not provided in internal/hetzner/provider.go

**Checkpoint**: All provider configuration options work via config and CLI flags

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, edge cases, and validation

### Error Handling

- [ ] T055 [P] Implement auth error detection and user-friendly message in internal/cli/root.go
- [ ] T056 [P] Implement quota exceeded error detection and guidance in internal/cli/new.go
- [ ] T057 [P] Implement provisioning timeout error handling in internal/cli/new.go
- [ ] T058 [P] Handle old config format migration (detect sprites_token, prompt for init) in internal/cli/root.go

### Validation & Cleanup

- [ ] T059 [P] Handle invalid/old sessions without provider field (warn and remove) in internal/cli/list.go
- [ ] T060 Validate Hetzner credentials on first use in internal/hetzner/provider.go
- [X] T061 Run go fmt and golangci-lint on all new files
- [ ] T062 Verify quickstart.md flow works end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 (needs working provider to test switching)
- **User Story 3 (P2)**: Depends on US1 (needs sessions with provider field)
- **User Story 4 (P3)**: Depends on US1 (needs working create flow)

### Within Each User Story

- Hetzner package before CLI updates
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1 (Setup)**:
```
T003 + T004 + T005 (create directories)
```

**Phase 2 (Foundational)**:
```
T006 + T007 + T008 (provider types) → T009 + T010 (interfaces) → T011 (registry)
T012 + T013 (config types) → T014 + T015 (config validation)
T016 → T017 (session types)
T018 → T019 + T020 (SSH layer - exec and console parallel)
T021 (delete sprites - independent)
```

**Phase 3 (US1)**:
```
T022 → T023 + T024 (Hetzner client → SSH keys and setup parallel)
T025 + T026 + T027 + T028 + T029 (provider methods after client)
T030 + T031 (register provider)
T032 → T033 + T034 + T035 + T036 + T037 (CLI updates after root.go)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (add dependencies, create directories)
2. Complete Phase 2: Foundational (interfaces, config, session, sshexec)
3. Complete Phase 3: User Story 1 (Hetzner provider, CLI updates)
4. **STOP and VALIDATE**: Test `sandctl new`, `sandctl console`, `sandctl destroy`
5. Deploy/demo if ready - this is a fully functional replacement for sprites!

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → **MVP Complete!**
3. Add User Story 2 → Test `--provider` flag
4. Add User Story 3 → Test `sandctl list` sync
5. Add User Story 4 → Test config options
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- This is a breaking change: remove sprites completely, no backward compatibility
