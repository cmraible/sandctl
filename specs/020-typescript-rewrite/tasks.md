# Tasks: Rewrite sandctl in TypeScript with Bun

**Input**: Design documents from `/specs/020-typescript-rewrite/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Organization**: Tasks are grouped into phases. Early phases establish the project skeleton and shared infrastructure. Later phases implement each command/feature area. The final phase covers CI/CD and polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **TypeScript source**: `src/` at repository root
- **Tests**: `tests/` at repository root
- Paths follow the project structure defined in plan.md

---

## Phase 1: Project Scaffold & Build System

**Purpose**: Set up the TypeScript/Bun project, build system, and development tooling. Remove Go source files.

- [ ] T001 [P] [US1] Initialize Bun project: create `package.json` with name, version, type "module", and scripts (build, test, lint, fmt) at repository root
- [ ] T002 [P] [US1] Create `tsconfig.json` with strict mode, ESNext target, module resolution for Bun, path aliases, and include/exclude patterns
- [ ] T003 [P] [US1] Create `bunfig.toml` with test configuration (preload, coverage settings)
- [ ] T004 [P] [US1] Create `biome.json` with linter and formatter rules (replacing golangci-lint)
- [ ] T005 [US1] Install core dependencies: `commander`, `yaml`, `ssh2`, `ora`, `chalk`, `inquirer` and their type definitions
- [ ] T006 [US1] Create `src/index.ts` entry point with CLI program setup (name, description, version) and global flags (`--config`, `--verbose`)
- [ ] T007 [US1] Update `Makefile` with Bun build targets: `build`, `build-all` (cross-compile for darwin-arm64, darwin-x64, linux-x64, linux-arm64), `test`, `lint`, `fmt`, `clean`, `install`
- [ ] T008 [US1] Create `scripts/build-all.sh` for cross-platform compilation using `bun build --compile --target`
- [ ] T009 [US1] Update `.gitignore` to include `node_modules/`, `*.tsbuildinfo`, `dist/`, and Bun-specific artifacts; remove Go-specific entries
- [ ] T010 [US1] Remove Go source files: `go.mod`, `go.sum`, `tools.go`, `cmd/`, `internal/`, and Go test files. Keep `specs/`, `tests/e2e/` (to be rewritten), `README.md`, `.github/`
- [ ] T011 [US1] Verify project builds: run `bun build src/index.ts --compile --outfile sandctl` and test `./sandctl --help` produces output

**Checkpoint**: TypeScript project skeleton compiles to a native binary that shows help text.

---

## Phase 2: Core Infrastructure Modules

**Purpose**: Implement shared types, config management, session store, and UI utilities that all commands depend on.

### Config Module

- [ ] T012 [P] [US2] Define TypeScript types/interfaces in `src/config/config.ts`: `Config`, `ProviderConfig`, `GitConfig`, `NotFoundError`, `InsecurePermissionsError`, `ValidationError`
- [ ] T013 [P] [US2] Implement `load()` function in `src/config/config.ts`: read YAML file, validate permissions (0600), parse into Config type, handle legacy format migration
- [ ] T014 [P] [US2] Implement `validate()` function in `src/config/config.ts`: check required fields (default_provider, SSH key config), validate email format
- [ ] T015 [US2] Implement `src/config/writer.ts`: atomic write (temp file + rename), enforce 0600 file permissions and 0700 directory permissions, create directory if needed
- [ ] T016 [US2] Implement helper methods: `getProviderConfig()`, `setProviderSSHKeyID()`, `getSSHPublicKey()`, `getGitConfig()`, `hasGitConfig()`, `hasGitHubToken()`
- [ ] T017 [US2] Write unit tests in `tests/unit/config/config.test.ts`: loading, validation, error types, permission checks, legacy migration
- [ ] T018 [US2] Write unit tests in `tests/unit/config/writer.test.ts`: atomic writes, permission enforcement, directory creation

### Session Module

- [ ] T019 [P] [US4] Define types in `src/session/types.ts`: `Session`, `Status` (provisioning, running, stopped, failed), `Duration` (custom JSON serialization), `NotFoundError`
- [ ] T020 [P] [US4] Implement `src/session/names.ts`: port the 250-name pool from Go, implement `getRandomName()` with collision avoidance
- [ ] T021 [P] [US4] Implement `src/session/id.ts`: `generateID()` (picks from name pool), `validateID()` (2-15 lowercase letters), `normalizeName()` (case-insensitive)
- [ ] T022 [US4] Implement `src/session/store.ts`: JSON file CRUD (`add`, `update`, `remove`, `get`, `list`, `listActive`), case-insensitive lookups, duplicate detection
- [ ] T023 [US4] Write unit tests in `tests/unit/session/`: test ID generation, name pool, store CRUD, case-insensitive matching, collision avoidance

### UI Module

- [ ] T024 [P] [US1] Implement `src/ui/errors.ts`: `formatError()` mapping error types to exit codes (0, 2, 3, 4, 5) and helpful messages with `[error]` prefix
- [ ] T025 [P] [US1] Implement `src/ui/progress.ts`: Spinner wrapper (start, update, success, fail), `runSteps()` for multi-step operations, `printSuccess`, `printError`, `printWarning`, `printInfo`
- [ ] T026 [P] [US1] Implement `src/ui/table.ts`: Table formatting with column alignment, padding, separator (2-space), unicode support
- [ ] T027 [P] [US2] Implement `src/ui/prompt.ts`: `promptString`, `promptSecret` (masked input), `promptSelect`, `promptYesNo` (with defaults), TTY detection
- [ ] T028 [US1] Write unit tests in `tests/unit/ui/`: test error formatting, table output, exit code mapping

### Utility Module

- [ ] T029 [P] Implement `src/utils/paths.ts`: tilde expansion (`~` → home directory), path resolution

**Checkpoint**: All shared infrastructure is tested and ready for command implementations.

---

## Phase 3: Provider System & Hetzner Implementation

**Purpose**: Implement the pluggable provider interface and the Hetzner Cloud provider.

### Provider Interface

- [ ] T030 [P] Define `src/provider/interface.ts`: `Provider` interface (name, create, get, delete, list, waitReady), `SSHKeyManager` interface (ensureSSHKey)
- [ ] T031 [P] Define `src/provider/types.ts`: `VM` type, `CreateOpts`, `VMStatus` enum (provisioning, starting, running, stopping, stopped, deleting, failed)
- [ ] T032 [P] Define `src/provider/errors.ts`: `ErrNotFound`, `ErrAuthFailed`, `ErrQuotaExceeded`, `ErrProvisionFailed`, `ErrTimeout`
- [ ] T033 Implement `src/provider/registry.ts`: `register()`, `get()`, `available()` — provider factory registry

### Hetzner Provider

- [ ] T034 [US3] Implement `src/hetzner/client.ts`: Hetzner API client using REST `fetch` calls (or `@hetznercloud/hcloud-js` if Bun-compatible) — create server, get server, delete server, list servers, list datacenters
- [ ] T035 [US3] Implement `src/hetzner/provider.ts`: Provider interface implementation — `create()` (with cloud-init, labels, defaults), `get()`, `delete()`, `list()`, `waitReady()` (poll every 5s, check IP + SSH)
- [ ] T036 [US3] Implement `src/hetzner/ssh-keys.ts`: `ensureSSHKey()` — idempotent key creation with fingerprint deduplication and race condition handling
- [ ] T037 [US3] Implement `src/hetzner/setup.ts`: Cloud-init script generation — Docker install, agent user creation, SSH key copy, GitHub CLI install, boot-finished marker
- [ ] T038 [US3] Register Hetzner provider in registry, auto-register on import

**Checkpoint**: Hetzner provider can create, get, list, and delete VMs via API.

---

## Phase 4: SSH Module

**Purpose**: Implement SSH client for command execution, interactive console, and agent discovery.

- [ ] T039 [P] [US5] Implement `src/ssh/client.ts`: SSH client wrapper using `ssh2` — connect (with agent or key file), close, connection options (port, user, timeout)
- [ ] T040 [US6] Implement `src/ssh/exec.ts`: `exec()` (run command, return stdout/stderr/exit code), `execWithStreams()` (custom I/O), `checkConnection()` (TCP probe)
- [ ] T041 [US5] Implement `src/ssh/console.ts`: Interactive PTY terminal — raw mode, window resize handling (SIGWINCH), terminal passthrough
- [ ] T042 [US9] Implement `src/ssh/agent.ts`: SSH agent discovery — check `~/.ssh/config` IdentityAgent, 1Password socket, `SSH_AUTH_SOCK`; list keys, get key by fingerprint, get signer

**Checkpoint**: SSH client can execute commands and open interactive terminals on remote hosts.

---

## Phase 5: CLI Commands — Core (P1)

**Purpose**: Implement all P1 commands that form the core user workflow.

### Version Command

- [ ] T043 [US1] Implement `src/commands/version.ts`: Print version, commit, build time. Wire build info from compile-time constants or package.json version.

### Init Command

- [ ] T044 [US2] Implement `src/commands/init.ts` interactive mode: detect existing config, prompt for Hetzner token (secret), SSH key config (select agent vs file), region (select from ash/hel1/fsn1/nbg1), server type (select), git config (detect existing ~/.gitconfig), GitHub token (optional, secret)
- [ ] T045 [US2] Implement `src/commands/init.ts` non-interactive mode: require `--hetzner-token` + (`--ssh-agent` OR `--ssh-public-key`), validate all flag values, reject conflicting flags
- [ ] T046 [US2] Implement all `init` flags: `--hetzner-token`, `--ssh-public-key`, `--ssh-agent`, `--ssh-key-fingerprint`, `--region`, `--server-type`, `--opencode-zen-key`, `--git-config-path`, `--git-user-name`, `--git-user-email`, `--github-token`
- [ ] T047 [US2] Write unit tests for init command: flag validation, mutual exclusivity, email validation, path expansion

### New Command

- [ ] T048 [US3] Implement `src/commands/new.ts`: Load config, get provider, generate session ID, provision VM with progress steps (ensure SSH key, provision VM, wait ready, setup opencode, setup git, setup GitHub CLI, run template script)
- [ ] T049 [US3] Implement new command flags: `-t/--timeout`, `--no-console`, `-T/--template`, `-p/--provider`, `--region`, `--server-type`, `--image`
- [ ] T050 [US3] Implement provisioning error cleanup: delete VM on failure, mark session as failed, print recovery instructions
- [ ] T051 [US3] Implement auto-console: detect TTY, connect to console after successful provisioning (unless `--no-console`)
- [ ] T052 [US3] Implement git config setup via SSH: read local gitconfig or generate minimal config, base64 encode, transfer via SSH, set ownership (agent:agent)
- [ ] T053 [US3] Implement GitHub CLI setup via SSH: pass token via stdin to `gh auth login --with-token`, run `gh auth setup-git`
- [ ] T054 [US3] Implement template script execution: load template init.sh, base64 encode, transfer and execute via SSH with environment variables (`SANDCTL_TEMPLATE_NAME`, `SANDCTL_TEMPLATE_NORMALIZED`)

### List Command

- [ ] T055 [US4] Implement `src/commands/list.ts`: Load sessions, sync with provider API, display table (ID, PROVIDER, STATUS, CREATED, TIMEOUT) or JSON output
- [ ] T056 [US4] Implement list flags: `-f/--format` (table/json), `-a/--all` (include stopped/failed)
- [ ] T057 [US4] Implement timeout display: "Xh remaining", "Xm remaining", "expired", or "-"

### Console Command

- [ ] T058 [US5] Implement `src/commands/console.ts`: Validate TTY, normalize session name, get session, check status, open interactive SSH console with "Connecting to..." message

### Exec Command

- [ ] T059 [US6] Implement `src/commands/exec.ts`: Normalize session name, get session, check status; with `-c` flag run single command; without flag open interactive shell

### Destroy Command

- [ ] T060 [US7] Implement `src/commands/destroy.ts`: Normalize session name, get session, confirm (unless `--force`), delete VM from provider, remove session from local store
- [ ] T061 [US7] Implement destroy aliases: `rm`, `delete`
- [ ] T062 [US7] Handle legacy sessions and provider deletion failures gracefully

**Checkpoint**: Full core workflow works: init → new → list → exec/console → destroy.

---

## Phase 6: CLI Commands — Templates (P2)

**Purpose**: Implement template management subcommands.

- [ ] T063 [P] [US8] Implement `src/commands/template/index.ts`: Template parent command with subcommand registration
- [ ] T064 [P] [US8] Port template store from Go to TypeScript: `src/` already has templateconfig equivalent — implement template types, normalize function, store (add, get, list, remove, getInitScript, getInitScriptPath)
- [ ] T065 [US8] Implement `src/commands/template/add.ts`: Create template dir, generate init.sh stub, detect and launch editor (EDITOR → VISUAL → vim → vi → nano)
- [ ] T066 [US8] Implement `src/commands/template/list.ts`: List templates in table format (NAME, CREATED)
- [ ] T067 [US8] Implement `src/commands/template/show.ts`: Print init script content to stdout
- [ ] T068 [US8] Implement `src/commands/template/edit.ts`: Open init script in detected editor
- [ ] T069 [US8] Implement `src/commands/template/remove.ts`: Confirm (unless `--force`), delete template directory

**Checkpoint**: Template CRUD workflow works: add → list → show → edit → remove.

---

## Phase 7: SSH Agent Integration (P2)

**Purpose**: Implement SSH agent discovery and forwarding.

- [ ] T070 [US9] Port SSH agent discovery logic to `src/ssh/agent.ts`: Parse `~/.ssh/config` for IdentityAgent, check 1Password socket paths, fall back to `SSH_AUTH_SOCK`
- [ ] T071 [US9] Implement agent key listing: list keys with type, fingerprint (SHA256), comment
- [ ] T072 [US9] Implement key selection by fingerprint for multi-key agents
- [ ] T073 [US9] Test agent discovery with mock socket paths

**Checkpoint**: SSH agent mode works for session creation and SSH connections.

---

## Phase 8: CI/CD & Build Pipeline

**Purpose**: Update GitHub Actions workflows for the TypeScript project.

- [ ] T074 [P] Update `.github/workflows/ci.yml`: Replace Go jobs with Bun jobs — lint (biome check), test (bun test), build (bun build --compile)
- [ ] T075 [P] Add E2E test job to CI: build binary, generate SSH key, run E2E tests with Hetzner credentials
- [ ] T076 Update Makefile build targets for version/commit/build-time injection into TypeScript binary (via build-time environment variables or generated version file)

**Checkpoint**: CI pipeline passes with lint, test, and build jobs.

---

## Phase 9: E2E Tests

**Purpose**: Rewrite E2E tests in TypeScript using Bun's test runner.

- [ ] T077 Implement `tests/e2e/cli.test.ts`: Port all E2E scenarios from Go — version, init, new, list, exec, destroy, console, full workflow lifecycle
- [ ] T078 Implement E2E test helpers: binary execution wrapper, temp config file management, cleanup utilities
- [ ] T079 Add E2E test scenarios for templates: add, list, show, remove, use with `new -T`

**Checkpoint**: E2E tests pass with real Hetzner VM provisioning.

---

## Phase 10: Polish & Documentation

**Purpose**: Final cleanup, documentation updates, and backward compatibility verification.

- [ ] T080 Update `README.md`: Replace Go installation instructions with Bun/TypeScript build instructions, update prerequisites
- [ ] T081 Update `CLAUDE.md`: Replace Go-specific development guidelines with TypeScript/Bun guidelines
- [ ] T082 Verify backward compatibility: load existing Go-generated `~/.sandctl/config` and `~/.sandctl/sessions.json` files
- [ ] T083 Verify error messages match existing format: `[error]` prefix, helpful suggestions, exit codes
- [ ] T084 Verify binary size is within 2x of Go binary
- [ ] T085 Verify startup time is under 200ms
- [ ] T086 Remove Go-specific files: `.golangci.yml`, Go CI workflow references

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Scaffold)**: No dependencies — start immediately
- **Phase 2 (Infrastructure)**: Depends on Phase 1 — BLOCKS all commands
- **Phase 3 (Provider)**: Depends on Phase 2 (config, session types)
- **Phase 4 (SSH)**: Depends on Phase 2 (config for keys)
- **Phase 5 (Core Commands)**: Depends on Phases 2, 3, 4
- **Phase 6 (Templates)**: Depends on Phase 2 (store patterns)
- **Phase 7 (SSH Agent)**: Depends on Phase 4 (SSH module)
- **Phase 8 (CI/CD)**: Can start after Phase 1, finalized after Phase 5
- **Phase 9 (E2E)**: Depends on Phase 5 (core commands working)
- **Phase 10 (Polish)**: Depends on all prior phases

### Parallel Opportunities

- Within Phase 2: Config, Session, UI, and Utils modules can be built in parallel (T012-T029)
- Within Phase 3: Provider interface types (T030-T032) can be built in parallel
- Phase 3 and Phase 4 can be built in parallel (provider and SSH are independent)
- Phase 6 (Templates) and Phase 7 (SSH Agent) can be built in parallel
- Phase 8 (CI/CD) linting/testing jobs can start as soon as Phase 1 is complete

### Within Each Phase

- Types and interfaces before implementations
- Implementations before tests
- Tests before dependent phases

---

## Implementation Strategy

### MVP First (Phases 1-5)

1. Complete Phase 1: Project skeleton builds to native binary
2. Complete Phase 2: Config, session, UI modules tested
3. Complete Phases 3 & 4 in parallel: Provider and SSH working
4. Complete Phase 5: Core commands working end-to-end
5. **STOP and VALIDATE**: Run `sandctl init → new → list → exec → destroy` manually
6. If stable, proceed to Phases 6-10

### Incremental Delivery

1. Phase 1 → Binary shows help text
2. Phase 2 → Infrastructure tested
3. Phases 3+4 → Can create and connect to VMs
4. Phase 5 → **Full core workflow** (init → new → list → exec → destroy)
5. Phase 6 → Templates working
6. Phase 7 → SSH agent working
7. Phase 8 → CI pipeline green
8. Phase 9 → E2E tests passing
9. Phase 10 → Documentation updated, polish complete

Each phase adds value without breaking previous phases.

---

## Notes

- [P] tasks = different files or modules, no dependencies between them
- [Story] label maps task to specific user story for traceability
- The 250-name pool in `src/session/names.ts` must be copied exactly from Go source to maintain compatibility
- Cloud-init script in `src/hetzner/setup.ts` must produce identical VM setup as the Go version
- All existing config/session files from Go version must load without modification
- Secrets (Hetzner token, GitHub token) must never appear in logs or console output
- Use `fetch` for Hetzner API if `@hetznercloud/hcloud-js` has Bun compatibility issues
