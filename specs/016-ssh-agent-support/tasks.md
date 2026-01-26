# Tasks: SSH Agent Support

**Input**: Design documents from `/specs/016-ssh-agent-support/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅

**Tests**: Not explicitly requested in feature specification. Tests omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new sshagent package and prepare the project structure

- [X] T001 Create internal/sshagent/ directory for SSH agent package
- [X] T002 [P] Run `go get golang.org/x/crypto/ssh` to ensure dependency is available

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core SSH agent infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create AgentKey struct with Type, Fingerprint, Comment, PublicKey fields and DisplayString() method in internal/sshagent/agent.go
- [X] T004 Create Agent struct with conn and client fields in internal/sshagent/agent.go
- [X] T005 Implement Discovery() function to find agent sockets (SSH_AUTH_SOCK, 1Password, IdentityAgent) in internal/sshagent/agent.go
- [X] T006 Implement New() function to connect to first available SSH agent in internal/sshagent/agent.go
- [X] T007 Implement NewFromSocket(socketPath string) function in internal/sshagent/agent.go
- [X] T008 Implement ListKeys() method to return all keys from agent as []AgentKey in internal/sshagent/agent.go
- [X] T009 Implement GetKeyByFingerprint(fingerprint string) method in internal/sshagent/agent.go
- [X] T010 Implement Close() method in internal/sshagent/agent.go
- [X] T011 Add SSHKeySource, SSHPublicKeyInline, SSHKeyFingerprint fields to Config struct in internal/config/config.go
- [X] T012 Add GetSSHPublicKey() method to Config that returns public key content from either inline or file in internal/config/config.go
- [X] T013 Add validation rules for SSH key configuration (mutual exclusivity, format checks) in internal/config/config.go

**Checkpoint**: Foundation ready - SSH agent package exists with all core functions, config supports agent mode

---

## Phase 3: User Story 1 - Configure sandctl with SSH Agent Keys (Priority: P1) 🎯 MVP

**Goal**: Enable users with 1Password/ssh-agent to complete `sandctl init` without local key files

**Independent Test**: Run `sandctl init`, select SSH agent mode, verify configuration saves inline key and fingerprint

### Implementation for User Story 1

- [X] T014 [US1] Add auto-detection of SSH agent availability in init command in internal/cli/init.go
- [X] T015 [US1] Add interactive SSH key source selection (Agent vs File path) in internal/cli/init.go
- [X] T016 [US1] Implement key listing display with fingerprint and comment for interactive selection in internal/cli/init.go
- [X] T017 [US1] Implement single-key auto-selection when only one key is available in internal/cli/init.go
- [X] T018 [US1] Store selected agent key (inline public key + fingerprint + source:agent) to config in internal/cli/init.go
- [X] T019 [US1] Update new command to use GetSSHPublicKey() for VM provisioning in internal/cli/new.go

**Checkpoint**: User Story 1 complete - Interactive SSH agent configuration works end-to-end

---

## Phase 4: User Story 2 - Non-Interactive SSH Agent Configuration (Priority: P2)

**Goal**: Enable scripted/CI usage with `--ssh-agent` and `--ssh-key-fingerprint` flags

**Independent Test**: Run `sandctl init --hetzner-token TOKEN --ssh-agent` and verify it completes without prompts

### Implementation for User Story 2

- [X] T020 [US2] Add --ssh-agent boolean flag to init command in internal/cli/init.go
- [X] T021 [US2] Add --ssh-key-fingerprint string flag to init command in internal/cli/init.go
- [X] T022 [US2] Implement non-interactive flow when --ssh-agent is provided (use first key) in internal/cli/init.go
- [X] T023 [US2] Implement --ssh-key-fingerprint selection in non-interactive mode in internal/cli/init.go
- [X] T024 [US2] Validate that --ssh-agent and --ssh-public-key are mutually exclusive in internal/cli/init.go

**Checkpoint**: User Story 2 complete - Non-interactive SSH agent configuration works for CI/scripting

---

## Phase 5: User Story 3 - Graceful Fallback and Error Handling (Priority: P3)

**Goal**: Provide clear, actionable error messages when SSH agent configuration fails

**Independent Test**: Run `sandctl init` with no SSH agent available and verify helpful error message is shown

### Implementation for User Story 3

- [X] T025 [US3] Add error message for "No SSH agent found" with suggestions in internal/sshagent/agent.go
- [X] T026 [US3] Add error message for "SSH agent socket not found" with path info in internal/sshagent/agent.go
- [X] T027 [US3] Add error message for "Cannot connect to SSH agent" in internal/sshagent/agent.go
- [X] T028 [US3] Add error message for "SSH agent has no keys loaded" with suggestions in internal/cli/init.go
- [X] T029 [US3] Add error message for "Key with fingerprint X not found" with available keys list in internal/cli/init.go
- [X] T030 [US3] Offer file path fallback option when agent errors occur in interactive mode in internal/cli/init.go

**Checkpoint**: User Story 3 complete - All error scenarios have helpful messages and fallback options

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [X] T031 Run quickstart.md validation scenarios manually
- [X] T032 Verify backward compatibility with existing file-based configs
- [X] T033 Run `go build` and `go vet` to ensure no build issues

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories should proceed sequentially in priority order (P1 → P2 → P3)
  - US2 depends on US1's init command changes
  - US3 builds on error paths from US1 and US2
- **Polish (Final Phase)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 init command structure being in place
- **User Story 3 (P3)**: Depends on error paths from US1 and US2 existing

### Within Each Phase

- Foundational tasks T003-T010 build the sshagent package sequentially
- Config tasks T011-T013 can run in parallel with sshagent package work (different files)
- US1 tasks T014-T019 must be sequential (same file, building on each other)
- US2 tasks T020-T024 must be sequential (same file)
- US3 tasks T025-T030: T025-T027 can run in parallel (sshagent errors), T028-T030 sequential (init errors)

### Parallel Opportunities

**Phase 2 (Foundational)**:
```bash
# These can run in parallel (different files):
Task T011: "Add SSHKeySource fields to Config in internal/config/config.go"
Task T003: "Create AgentKey struct in internal/sshagent/agent.go"
```

**Phase 5 (US3 Error Messages)**:
```bash
# These can run in parallel (different error types in same file):
Task T025: "Add error message for 'No SSH agent found'"
Task T026: "Add error message for 'SSH agent socket not found'"
Task T027: "Add error message for 'Cannot connect to SSH agent'"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test interactive SSH agent init end-to-end
5. Users can now configure sandctl with 1Password/ssh-agent

### Incremental Delivery

1. Complete Setup + Foundational → Core SSH agent package ready
2. Add User Story 1 → Test interactively → Users can configure via agent (MVP!)
3. Add User Story 2 → Test with flags → CI/scripting enabled
4. Add User Story 3 → Test error scenarios → Production-ready UX
5. Each story adds value without breaking previous stories

---

## Notes

- No test tasks generated (tests not explicitly requested in spec)
- Tasks concentrated in 3 files: internal/sshagent/agent.go, internal/config/config.go, internal/cli/init.go
- Reuse socket discovery patterns from existing internal/sshexec/client.go
- Maintain backward compatibility with existing ssh_public_key file path configuration
- Config file permissions remain 0600
