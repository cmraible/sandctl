# Tasks: Cloud-Init Agent User

**Input**: Design documents from `/specs/017-cloud-init-agent-user/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, quickstart.md ✓

**Tests**: Not explicitly requested in specification - omitting test tasks per template guidelines.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single CLI project**: `internal/` at repository root
- Files to modify per plan.md:
  - `internal/hetzner/setup.go` - Cloud-init script generation
  - `internal/sshexec/client.go` - SSH client default user
  - `internal/repo/parser.go` - Repository target path

---

## Phase 1: Setup

**Purpose**: No setup tasks required - this feature modifies existing files only

*No setup tasks - proceeding directly to implementation*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before user story implementation

**⚠️ CRITICAL**: User Story 3 depends on User Stories 1 and 2 being complete (agent user must exist, and path must be correct before cloning with ownership works)

- [x] T001 Change `defaultSSHUser` constant from "root" to "agent" in internal/sshexec/client.go:17

**Checkpoint**: Foundation ready - all SSH connections now default to "agent" user

---

## Phase 3: User Story 1 - Create VMs with Non-Root Agent User (Priority: P1) 🎯 MVP

**Goal**: VMs are provisioned with a non-root "agent" user with passwordless sudo and SSH access

**Independent Test**: Run `sandctl new`, then `sandctl console`, verify `whoami` returns "agent" and home directory is `/home/agent`

### Implementation for User Story 1

- [x] T002 [US1] Update CloudInitScript() to create agent user with `useradd -m -s /bin/bash agent` in internal/hetzner/setup.go:17-43
- [x] T003 [US1] Add SSH authorized_keys propagation from root to agent user in internal/hetzner/setup.go (mkdir, cp, chown, chmod)
- [x] T004 [US1] Configure passwordless sudo for agent user via /etc/sudoers.d/agent in internal/hetzner/setup.go
- [x] T005 [US1] Add agent user to docker group with `usermod -aG docker agent` in internal/hetzner/setup.go

**Checkpoint**: At this point, User Story 1 should be fully functional - VMs have agent user with SSH access, sudo, and docker

---

## Phase 4: User Story 2 - Streamlined Tool Installation (Priority: P2)

**Goal**: VM provisioning installs only essential utilities (docker, git, curl, wget, jq, htop, vim) without language runtimes

**Independent Test**: Create VM, verify `which docker git curl wget jq htop vim` succeeds and `which nodejs python3` fails or returns non-installed

### Implementation for User Story 2

- [x] T006 [US2] Remove nodejs, npm, python3, python3-pip from apt-get install in CloudInitScript() in internal/hetzner/setup.go:31

**Checkpoint**: At this point, User Stories 1 AND 2 should both work - agent user exists and only essential tools are installed

---

## Phase 5: User Story 3 - Repository Cloned to Agent Home Directory (Priority: P3)

**Goal**: Repositories cloned via `--repo` flag are placed in `/home/agent/<repo-name>` with agent:agent ownership

**Independent Test**: Run `sandctl new --repo cmraible/test-repo`, connect via console, verify repo is at `/home/agent/test-repo` and owned by agent:agent

### Implementation for User Story 3

- [x] T007 [US3] Change TargetPath() return value from "/root/" to "/home/agent/" in internal/repo/parser.go:18-19
- [x] T008 [US3] Update CloudInitScriptWithRepo() to chown cloned repo to agent:agent in internal/hetzner/setup.go:46-52

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification and validation

- [x] T009 Run `go build ./...` to verify all code compiles
- [x] T010 Run `go vet ./...` to check for issues
- [x] T011 Run `go fmt ./...` to ensure consistent formatting
- [ ] T012 Manually test with `sandctl new` and verify agent user setup (per quickstart.md verification commands)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies - change SSH default user constant
- **User Story 1 (Phase 3)**: Depends on Foundational - agent user creation in cloud-init
- **User Story 2 (Phase 4)**: Independent of User Story 1 - can be done in parallel
- **User Story 3 (Phase 5)**: Depends on User Story 1 (agent user must exist for ownership to work)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (T001) - creates agent user
- **User Story 2 (P2)**: Can start after Foundational (T001) - independent of US1, just removes packages
- **User Story 3 (P3)**: Must wait for User Story 1 (T002-T005) - requires agent user to exist for chown

### Task-Level Dependencies

```
T001 (SSH default user)
  └── T002, T003, T004, T005 (User Story 1 - agent user creation)
        └── T007, T008 (User Story 3 - repo path and ownership)

T001 (SSH default user)
  └── T006 (User Story 2 - package removal, independent)

All User Story tasks → T009, T010, T011, T012 (Polish)
```

### Parallel Opportunities

- T002, T003, T004, T005 can be combined into a single edit of CloudInitScript() (same function)
- T006 can run in parallel with T002-T005 (different section of same function, but logically independent)
- T007 and T008 can run in parallel (different files)
- T009, T010, T011 can run in parallel (independent verification commands)

---

## Parallel Example: User Story 1

```bash
# Note: T002-T005 all modify the same function (CloudInitScript) so should be
# done as a single coherent edit to avoid conflicts

# After US1 complete, US3 tasks can be parallelized:
Task: "Change TargetPath() in internal/repo/parser.go"
Task: "Update CloudInitScriptWithRepo() in internal/hetzner/setup.go"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001: Change SSH default user to "agent"
2. Complete T002-T005: Update CloudInitScript() with agent user setup
3. **STOP and VALIDATE**: Run `sandctl new` and verify `whoami` returns "agent"
4. Deploy/demo if ready

### Incremental Delivery

1. T001 → SSH connections default to agent user
2. Add User Story 1 (T002-T005) → Test: agent user works → MVP complete!
3. Add User Story 2 (T006) → Test: only essential tools installed
4. Add User Story 3 (T007-T008) → Test: repos cloned to /home/agent with correct ownership
5. Each story adds value without breaking previous stories

### Recommended Execution Order

Since this is a small feature with 3 files:

1. **T001**: Single line change in client.go (30 seconds)
2. **T002-T005 + T006**: Combined edit to CloudInitScript() in setup.go (5-10 minutes)
3. **T007**: Single line change in parser.go (30 seconds)
4. **T008**: Small addition to CloudInitScriptWithRepo() in setup.go (2 minutes)
5. **T009-T012**: Verification (5 minutes)

Total estimated implementation: ~20 minutes of coding + testing time

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All changes are to existing files - no new files created
- Cloud-init script order matters: create user → add to groups → setup SSH → setup sudo
