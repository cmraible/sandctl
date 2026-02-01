# Tasks: Sandbox Git Configuration

**Input**: Design documents from `/specs/019-sandbox-git-config/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in feature specification - test tasks excluded.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: Go project with `internal/` and `cmd/` at repository root
- Paths follow existing codebase structure from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend existing Config struct with git-related fields

- [X] T001 [P] Add git config fields (`GitConfigPath`, `GitUserName`, `GitUserEmail`) to Config struct in internal/config/config.go
- [X] T002 [P] Add GitHub token field (`GitHubToken`) to Config struct in internal/config/config.go
- [X] T003 Add `GitConfig` helper struct for passing git config to sandbox setup in internal/config/config.go
- [X] T004 Implement `HasGitConfig()`, `GetGitConfig()`, `HasGitHubToken()` methods on Config in internal/config/config.go
- [X] T005 Implement `ValidateGitConfig()` method with email validation in internal/config/config.go

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Implement `getGitConfig(key string)` helper function to read local git config using `git config --global --get` in internal/cli/init.go
- [X] T007 Implement `isValidGitEmail(email string)` validation function in internal/cli/init.go
- [X] T008 Add GitHub CLI installation script to cloud-init in internal/hetzner/setup.go (install from GitHub's official apt repo)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Agent Makes Git Commits in Sandbox (Priority: P1) 🎯 MVP

**Goal**: Enable AI agents to run `git commit` in sandboxes with proper author information

**Independent Test**: Create a sandbox, run `git init && git commit`, verify author name/email in `git log`

### Implementation for User Story 1

- [X] T009 [US1] Add `--git-config-path`, `--git-user-name`, `--git-user-email` flags to init command in internal/cli/init.go
- [X] T010 [US1] Add flag validation (mutual exclusivity, paired name/email) to init command in internal/cli/init.go
- [X] T011 [US1] Detect existing `~/.gitconfig` and extract name/email using `getGitConfig()` in internal/cli/init.go
- [X] T012 [US1] Add interactive prompts for git config (detect existing OR manual entry) in internal/cli/init.go
- [X] T013 [US1] Display current git config when already configured during `sandctl init` in internal/cli/init.go
- [X] T014 [US1] Save git config fields to sandctl config file in internal/cli/init.go
- [X] T015 [US1] Add warning message during `sandctl new` if git config not set in internal/cli/new.go
- [X] T016 [US1] Implement `setupGitConfigViaSSH()` function to copy gitconfig to sandbox in internal/cli/new.go
- [X] T017 [US1] Handle file mode: read user's gitconfig, base64 encode, transfer via SSH, write to `/home/agent/.gitconfig` in internal/cli/new.go
- [X] T018 [US1] Handle manual mode: generate minimal gitconfig with name/email, write to `/home/agent/.gitconfig` in internal/cli/new.go
- [X] T019 [US1] Set correct ownership (agent:agent) and permissions (0644) for gitconfig in sandbox in internal/cli/new.go
- [X] T020 [US1] Call `setupGitConfigViaSSH()` from sandbox provisioning flow in internal/cli/new.go
- [X] T021 [US1] Add "Configuring git" spinner message during setup in internal/cli/new.go

**Checkpoint**: At this point, agents can make git commits with correct author info

---

## Phase 4: User Story 2 - Agent Pushes to Remote Repository (Priority: P2)

**Goal**: Enable AI agents to push commits to remote repositories using SSH agent forwarding

**Independent Test**: Create a sandbox with SSH agent, clone a repo, make a commit, push to remote

**Dependencies**: Relies on existing SSH agent forwarding from feature #016

### Implementation for User Story 2

- [X] T022 [US2] Verify SSH agent forwarding works with git push operations (documentation/validation only - no code changes needed)

**Checkpoint**: At this point, agents can push commits (using existing SSH agent forwarding)

---

## Phase 5: User Story 3 - Agent Creates Pull Request (Priority: P3)

**Goal**: Enable AI agents to create pull requests using GitHub CLI (`gh`)

**Independent Test**: Create a sandbox with GitHub token, verify `gh auth status` shows authenticated

### Implementation for User Story 3

- [X] T023 [US3] Add `--github-token` flag to init command in internal/cli/init.go
- [X] T024 [US3] Add interactive prompt for GitHub token (secure/hidden input) in internal/cli/init.go
- [X] T025 [US3] Save GitHub token to sandctl config file in internal/cli/init.go
- [X] T026 [US3] Mask GitHub token display (show `ghp_xxxx...xxxx`) when already configured in internal/cli/init.go
- [X] T027 [US3] Implement `setupGitHubCLIViaSSH()` function to authenticate gh in sandbox in internal/cli/new.go
- [X] T028 [US3] Pass token via SSH stdin to `gh auth login --with-token --hostname github.com` in internal/cli/new.go
- [X] T029 [US3] Run `gh auth setup-git` to configure git credential helper in internal/cli/new.go
- [X] T030 [US3] Call `setupGitHubCLIViaSSH()` from sandbox provisioning flow (after git config) in internal/cli/new.go
- [X] T031 [US3] Add "Authenticating GitHub CLI" spinner message during setup in internal/cli/new.go

**Checkpoint**: At this point, agents can create PRs using `gh pr create`

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [X] T032 Run quickstart.md validation scenarios manually
- [X] T033 Verify error messages match cli-interface.md contract
- [X] T034 Ensure GitHub token never appears in logs or console output

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 (git commits) must complete before US2/US3 for practical reasons
  - US2 (push) relies on existing SSH agent feature
  - US3 (PRs) can be implemented independently of US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - Core git config functionality
- **User Story 2 (P2)**: No code changes needed - validates existing SSH agent forwarding works with git
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - GitHub CLI authentication

### Within Each User Story

- Config struct changes before CLI changes
- CLI changes before SSH setup functions
- Setup functions before calling code in new.go

### Parallel Opportunities

- T001 and T002 can run in parallel (different struct fields)
- All user stories can be implemented in priority order with incremental value

---

## Parallel Example: Phase 1

```bash
# Launch config struct modifications together:
Task: "Add git config fields to Config struct in internal/config/config.go"
Task: "Add GitHub token field to Config struct in internal/config/config.go"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (Config struct)
2. Complete Phase 2: Foundational (helpers, gh CLI install)
3. Complete Phase 3: User Story 1 (git config prompts, sandbox setup)
4. **STOP and VALIDATE**: Create sandbox, verify `git commit` works with correct author
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → **Agents can commit**
3. Add User Story 2 → Validate push works → **Agents can push** (no code changes)
4. Add User Story 3 → Test independently → **Agents can create PRs**
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files or struct fields, no dependencies
- [Story] label maps task to specific user story for traceability
- User Story 2 requires no code changes - validates existing SSH agent forwarding
- All secrets (GitHub token) must be handled securely - never log or display
- Follow existing patterns in codebase (setupOpenCodeViaSSH for SSH-based setup)
