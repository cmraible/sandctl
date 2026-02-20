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

## Task Dependency Graph

Each task lists what it blocks and what it requires. This drives the parallel execution plan below.

```
T001─T004 ──┐
T005 ───────┤ (Phase 1: scaffold)
T006─T011 ──┘
      │
      ▼
┌─────────────────────────────────────────────────────┐
│ Phase 2: four independent work streams              │
│                                                     │
│  Config          Session        UI          Utils   │
│  T012─T014 ──┐   T019─T021 ─┐  T024─T027 ─┐  T029 │
│  T015─T016   │   T022        │  T028        │       │
│  T017─T018   │   T023        │              │       │
└──────┬───────┴───────┬───────┴──────┬───────┴───────┘
       │               │              │
       ▼               ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│ Phase 3:     │ │ Phase 4:     │ │ Phase 6:         │
│ Provider +   │ │ SSH module   │ │ Template store + │
│ Hetzner      │ │ T039─T041   │ │ commands         │
│ T030─T038    │ │              │ │ T063─T069        │
└──────┬───────┘ └──────┬───────┘ └────────┬─────────┘
       │                │                  │
       │                ├─── T042 ─────────┤
       │                │  (SSH Agent,     │
       │                │   Phase 7:       │
       │                │   T070─T073)     │
       │                │                  │
       ▼                ▼                  │
┌─────────────────────────────────────┐    │
│ Phase 5: CLI Commands               │    │
│                                     │    │
│  Version: T043 (no deps beyond P1)  │    │
│  Init:    T044─T047 (config + UI)   │    │
│  New:     T048─T054 (all modules)   │    │
│  List:    T055─T057 (session + prov)│    │
│  Console: T058 (SSH + session)      │    │
│  Exec:    T059 (SSH + session)      │    │
│  Destroy: T060─T062 (prov + session)│    │
└──────────────┬──────────────────────┘    │
               │                           │
               ▼                           ▼
┌──────────────────────────────────────────────────┐
│ Phase 8: CI/CD (T074─T076)                       │
│ Phase 9: E2E Tests (T077─T079)                   │
│ Phase 10: Polish & Docs (T080─T086)              │
└──────────────────────────────────────────────────┘
```

### Detailed Task Dependencies

| Task(s) | Requires | Blocks |
|---------|----------|--------|
| T001─T011 (Scaffold) | Nothing | Everything |
| T012─T018 (Config) | T001─T011 | T044─T047 (init cmd), T048 (new cmd), T055 (list cmd) |
| T019─T023 (Session) | T001─T011 | T048 (new cmd), T055 (list cmd), T058─T062 (console/exec/destroy) |
| T024─T028 (UI) | T001─T011 | T044 (init prompts), T048 (new spinners), T055 (list table), T060 (destroy confirm) |
| T029 (Utils) | T001─T011 | T013 (config load), T044 (init paths) |
| T030─T033 (Provider iface) | T012 (config types) | T034─T038 (Hetzner) |
| T034─T038 (Hetzner) | T030─T033 | T048 (new cmd), T055 (list sync), T060 (destroy) |
| T039─T041 (SSH client/exec/console) | T012 (config types) | T048 (new cmd), T058 (console), T059 (exec) |
| T042, T070─T073 (SSH Agent) | T039 (SSH client) | T048 (new cmd with agent), T058 (console with agent) |
| T043 (Version cmd) | T006 (entry point) | None |
| T044─T047 (Init cmd) | T012─T018, T024─T028 | T048 (new needs config) |
| T048─T054 (New cmd) | T012─T042 (all infra) | T077 (E2E) |
| T055─T057 (List cmd) | T019─T023, T030─T038 | T077 (E2E) |
| T058 (Console cmd) | T019─T023, T039─T041 | T077 (E2E) |
| T059 (Exec cmd) | T019─T023, T039─T041 | T077 (E2E) |
| T060─T062 (Destroy cmd) | T019─T023, T030─T038, T024─T028 | T077 (E2E) |
| T063─T069 (Templates) | T019─T023, T024─T028 | T079 (E2E templates) |
| T074─T076 (CI/CD) | T001─T011 (scaffold) | None (can iterate) |
| T077─T079 (E2E) | Phase 5 commands, T063─T069 | T080 (docs) |
| T080─T086 (Polish) | All prior phases | None |

---

## Engineer Assignment Plan (6 Engineers)

Work is split into **6 parallel streams** optimized for minimal blocking. Each stream is assigned to one engineer who owns those modules end-to-end, reducing context switching and merge conflicts.

### Stream Assignments

| Stream | Engineer | Owns | Primary Modules |
|--------|----------|------|-----------------|
| **A** | Eng 1 (Lead) | Scaffold + CI/CD + Polish | Phase 1, Phase 8, Phase 10, Version cmd |
| **B** | Eng 2 | Config + Init | `src/config/`, `src/commands/init.ts`, `src/utils/` |
| **C** | Eng 3 | Session + List + Destroy | `src/session/`, `src/commands/list.ts`, `src/commands/destroy.ts` |
| **D** | Eng 4 | UI + Templates | `src/ui/`, `src/commands/template/` |
| **E** | Eng 5 | Provider + Hetzner + New | `src/provider/`, `src/hetzner/`, `src/commands/new.ts` |
| **F** | Eng 6 | SSH + Console + Exec + Agent | `src/ssh/`, `src/commands/console.ts`, `src/commands/exec.ts` |

### Week-by-Week Execution Plan

#### Week 1: Scaffold + Infrastructure (all engineers unblocked by end of week)

| Day | Eng 1 (A) | Eng 2 (B) | Eng 3 (C) | Eng 4 (D) | Eng 5 (E) | Eng 6 (F) |
|-----|-----------|-----------|-----------|-----------|-----------|-----------|
| D1─D2 | PR-01: Scaffold (T001─T011) | — blocked — | — blocked — | — blocked — | — blocked — | — blocked — |
| D3─D4 | PR-08: CI lint+test (T074) | PR-02: Config types+load+write (T012─T018) | PR-03: Session types+store+names (T019─T023) | PR-04: UI errors+progress+table+prompt (T024─T028) | Review PRs | Review PRs |
| D5 | PR-09: Version cmd (T043) | PR-02 cont'd + T029 (utils) | PR-03 cont'd | PR-04 cont'd | Review PRs | Review PRs |

#### Week 2: Provider, SSH, Templates (parallel streams)

| Day | Eng 1 (A) | Eng 2 (B) | Eng 3 (C) | Eng 4 (D) | Eng 5 (E) | Eng 6 (F) |
|-----|-----------|-----------|-----------|-----------|-----------|-----------|
| D1─D3 | Reviews + PR-08 updates | PR-05: Init cmd interactive (T044─T046) | PR-06a: List cmd (T055─T057) | PR-07: Template store+cmds (T063─T069) | PR-10: Provider iface+Hetzner client (T030─T038) | PR-11: SSH client+exec+console (T039─T041) |
| D4─D5 | Reviews | PR-05b: Init non-interactive+tests (T045, T047) | PR-06b: Destroy cmd (T060─T062) | PR-07 cont'd | PR-10 cont'd | PR-12: SSH Agent (T042, T070─T073) |

#### Week 3: Core commands + Integration

| Day | Eng 1 (A) | Eng 2 (B) | Eng 3 (C) | Eng 4 (D) | Eng 5 (E) | Eng 6 (F) |
|-----|-----------|-----------|-----------|-----------|-----------|-----------|
| D1─D3 | Reviews + integration testing | Reviews + bugfixes | Reviews + bugfixes | Reviews + bugfixes | PR-13: New cmd (T048─T054) | PR-14: Console cmd (T058) + PR-15: Exec cmd (T059) |
| D4─D5 | PR-16: E2E tests (T077─T079) | Own-module bugfixes | Own-module bugfixes | Own-module bugfixes | PR-13 cont'd | Reviews + bugfixes |

#### Week 4: E2E, Polish, Ship

| Day | Eng 1 (A) | Eng 2 (B) | Eng 3 (C) | Eng 4 (D) | Eng 5 (E) | Eng 6 (F) |
|-----|-----------|-----------|-----------|-----------|-----------|-----------|
| D1─D2 | PR-16 cont'd | PR-17: Docs (T080─T081) | Compat testing (T082─T083) | Perf testing (T084─T085) | Bugfixes | Bugfixes |
| D3─D5 | PR-18: Final polish (T086) | Bugfixes | Bugfixes | Bugfixes | Bugfixes | Bugfixes |

---

## PR Plan (18 PRs, ordered by merge sequence)

Each PR is scoped to one module or command for fast review (~200─500 lines of implementation + tests).

| PR | Title | Tasks | Engineer | Blocked By | ~Size |
|----|-------|-------|----------|------------|-------|
| **PR-01** | `scaffold: init Bun project, build system, entry point` | T001─T011 | Eng 1 | None | ~300 lines |
| **PR-02** | `feat: config module (load, validate, write, tests)` | T012─T018, T029 | Eng 2 | PR-01 | ~500 lines |
| **PR-03** | `feat: session module (store, names, ID gen, tests)` | T019─T023 | Eng 3 | PR-01 | ~500 lines |
| **PR-04** | `feat: UI module (errors, progress, table, prompt, tests)` | T024─T028 | Eng 4 | PR-01 | ~500 lines |
| **PR-05** | `feat: init command (interactive + non-interactive)` | T044─T047 | Eng 2 | PR-02, PR-04 | ~450 lines |
| **PR-06** | `feat: list + destroy commands` | T055─T057, T060─T062 | Eng 3 | PR-03, PR-10 | ~400 lines |
| **PR-07** | `feat: template store + template commands` | T063─T069 | Eng 4 | PR-03, PR-04 | ~500 lines |
| **PR-08** | `ci: Bun lint + test + build workflow` | T074─T076 | Eng 1 | PR-01 | ~150 lines |
| **PR-09** | `feat: version command` | T043 | Eng 1 | PR-01 | ~50 lines |
| **PR-10** | `feat: provider interface + Hetzner client` | T030─T038 | Eng 5 | PR-02 | ~600 lines |
| **PR-11** | `feat: SSH client, exec, console` | T039─T041 | Eng 6 | PR-02 | ~500 lines |
| **PR-12** | `feat: SSH agent discovery + key selection` | T042, T070─T073 | Eng 6 | PR-11 | ~350 lines |
| **PR-13** | `feat: new command (provisioning workflow)` | T048─T054 | Eng 5 | PR-02─PR-04, PR-10, PR-11 | ~600 lines |
| **PR-14** | `feat: console command` | T058 | Eng 6 | PR-03, PR-11 | ~150 lines |
| **PR-15** | `feat: exec command` | T059 | Eng 6 | PR-03, PR-11 | ~150 lines |
| **PR-16** | `test: E2E test suite` | T077─T079 | Eng 1 | PR-05─PR-07, PR-13─PR-15 | ~500 lines |
| **PR-17** | `docs: update README + CLAUDE.md` | T080─T081 | Eng 2 | PR-13 | ~200 lines |
| **PR-18** | `chore: final polish, compat verification, cleanup` | T082─T086 | Eng 1 | PR-16, PR-17 | ~100 lines |

### PR Merge Order (Critical Path)

The longest dependency chain determines the minimum timeline:

```
PR-01 → PR-02 → PR-05 ─────────────────────────────────────┐
PR-01 → PR-03 ──────────────────────────────────────────────┤
PR-01 → PR-04 ──────────────────────────────────────────────┤
PR-01 → PR-10 → PR-06 ─────────────────────────────────────┤
PR-01 → PR-11 → PR-12 ─────────────────────────────────────┤
PR-01 → PR-11 → PR-14 ─────────────────────────────────────┤
PR-01 → PR-11 → PR-15 ─────────────────────────────────────┤
PR-02 + PR-04 + PR-10 + PR-11 → PR-13 ─────────────────────┤
PR-03 + PR-04 → PR-07 ─────────────────────────────────────┤
                                                            ▼
                                              PR-16 (E2E) → PR-18 (ship)
```

**Critical path**: PR-01 → PR-02 → PR-10 → PR-13 → PR-16 → PR-18 (6 sequential PRs)

PR-05 (init cmd) is **not** on the critical path — it develops in parallel alongside PR-10, since PR-13 (new cmd) depends on PR-02 (config) and PR-10 (provider) but not on PR-05 (init).

All other PRs can be developed and reviewed in parallel alongside the critical path.

### Scaling to 4 or 8 Engineers

**4 engineers** — merge streams:
- Combine B+D (Config/UI + Init + Templates → 1 engineer)
- Combine C+E (Session/Provider + List/Destroy/New → 1 engineer)
- Combine A as-is (Scaffold/CI/E2E)
- Combine F as-is (SSH/Console/Exec)

**8 engineers** — split streams:
- Split E into Provider interface (1 eng) + Hetzner implementation (1 eng)
- Split A into Scaffold (1 eng) + CI/E2E (1 eng)
- All other streams remain as-is

---

## Notes

- [P] tasks = different files or modules, no dependencies between them
- [Story] label maps task to specific user story for traceability
- The 250-name pool in `src/session/names.ts` must be copied exactly from Go source to maintain compatibility
- Cloud-init script in `src/hetzner/setup.ts` must produce identical VM setup as the Go version
- All existing config/session files from Go version must load without modification
- Secrets (Hetzner token, GitHub token) must never appear in logs or console output
- Use `fetch` for Hetzner API if `@hetznercloud/hcloud-js` has Bun compatibility issues
- Each PR should include implementation + tests for the module it covers
- Engineers should review each other's PRs — each engineer reviews ~3 PRs total
