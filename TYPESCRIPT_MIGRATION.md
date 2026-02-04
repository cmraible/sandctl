# sandctl TypeScript/Bun Migration Plan

## Overview
Rewrite sandctl CLI from Go to TypeScript with Bun + Commander.js. Each phase produces working, testable, committable code.

## Target Stack
- **Runtime**: Bun
- **CLI Framework**: Commander.js
- **SSH**: ssh2
- **YAML**: yaml (js-yaml)
- **Spinners**: ora
- **Config Compatibility**: Read existing `~/.sandctl/config` and `sessions.json`

---

## Phase 1: Project Foundation
**Goal**: Scaffold project with TypeScript config and core types

### 1.1 Project Setup
- [ ] Initialize Bun project (`bun init`)
- [ ] Configure `tsconfig.json` (strict mode)
- [ ] Add dev dependencies: `bun add -d @types/node typescript`
- [ ] Add runtime dependencies: `bun add commander yaml ora ssh2`
- [ ] Set up directory structure:
```
src/
├── index.ts
├── types/
├── config/
├── session/
├── provider/
├── providers/hetzner/
├── ssh/
├── template/
├── ui/
└── cli/commands/
```

**Commit**: "Initialize TypeScript/Bun project structure"
**Validation**: `bun build src/index.ts` succeeds

### 1.2 Core Types
- [ ] Port `provider/types.ts` - VM, VMStatus, CreateOpts
- [ ] Port `session/types.ts` - Session, Status, Duration
- [ ] Port `config/types.ts` - Config, ProviderConfig, GitConfig
- [ ] Port `template/types.ts` - TemplateConfig

**Commit**: "Add core TypeScript type definitions"
**Validation**: Types compile, can be imported

### 1.3 Pure Utilities (no I/O)
- [ ] Port `session/names.ts` - Word lists, random selection
- [ ] Port `session/id.ts` - ID generation/validation
- [ ] Port `template/normalize.ts` - Name normalization
- [ ] Write unit tests for each utility

**Commit**: "Add pure utility functions with tests"
**Validation**: `bun test` passes

---

## Phase 2: Storage Layer
**Goal**: File-based persistence for config, sessions, templates

### 2.1 Config Module
- [ ] `config/loader.ts` - Load YAML, check 0600 permissions
- [ ] `config/writer.ts` - Atomic write with temp file
- [ ] `config/validation.ts` - Validate required fields
- [ ] Unit tests

**Commit**: "Add config loading and validation"
**Validation**: Can load existing `~/.sandctl/config`, permissions enforced

### 2.2 Session Store
- [ ] `session/store.ts` - JSON CRUD with async-mutex
- [ ] Unit tests for concurrent access

**Commit**: "Add session store"
**Validation**: Can read existing `~/.sandctl/sessions.json`

### 2.3 Template Store
- [ ] `template/store.ts` - Template CRUD
- [ ] `template/generator.ts` - Init script generation

**Commit**: "Add template configuration store"
**Validation**: Templates can be created/listed/removed

---

## Phase 3: Provider Abstraction
**Goal**: Define provider interface and registry

- [ ] `provider/interface.ts` - Provider, SSHKeyManager interfaces
- [ ] `provider/registry.ts` - Factory registration/lookup
- [ ] `provider/errors.ts` - ErrNotFound, ErrAuthFailed, etc.

**Commit**: "Add provider interface and registry"
**Validation**: Interface compiles, registry can register/get providers

---

## Phase 4: Hetzner Provider
**Goal**: Implement Hetzner Cloud API client

### 4.1 API Client
- [ ] `providers/hetzner/client.ts` - fetch-based Hetzner API wrapper
  - `createServer()`, `getServer()`, `listServers()`, `deleteServer()`
  - `validateCredentials()`
  - SSH key management
- [ ] Unit tests with mock responses

**Commit**: "Add Hetzner API client"
**Validation**: Can validate credentials, list servers

### 4.2 Provider Implementation
- [ ] `providers/hetzner/provider.ts` - Implements Provider interface
- [ ] `providers/hetzner/ssh-keys.ts` - SSHKeyManager implementation
- [ ] `providers/hetzner/setup.ts` - Cloud-init script generation
- [ ] Auto-register in provider registry

**Commit**: "Add Hetzner provider implementation"
**Validation**: Can create/list/delete servers via API

---

## Phase 5: SSH Layer
**Goal**: SSH client for command execution and console

### 5.1 SSH Client
- [ ] `ssh/client.ts` - ssh2 wrapper with connection pooling
- [ ] Support private key and agent authentication

### 5.2 SSH Execution
- [ ] `ssh/exec.ts` - Remote command execution
- [ ] `ssh/console.ts` - Interactive PTY shell

### 5.3 SSH Agent Discovery
- [ ] `ssh/agent.ts` - Discover 1Password, ssh-agent, gpg-agent sockets

**Commit**: "Add SSH execution layer"
**Validation**: Can execute commands on remote server

---

## Phase 6: UI Layer
**Goal**: Terminal UI components

- [ ] `ui/spinner.ts` - ora wrapper with step runner
- [ ] `ui/prompt.ts` - String, secret, select prompts
- [ ] `ui/table.ts` - Formatted table output
- [ ] `ui/errors.ts` - Error formatting

**Commit**: "Add terminal UI components"
**Validation**: Spinners animate, prompts work interactively

---

## Phase 7: CLI Commands
**Goal**: Implement all commands with Commander.js

### 7.1 Program Setup
- [ ] `cli/program.ts` - Root command with global options
- [ ] `cli/commands/version.ts` - Version info

**Commit**: "Add CLI program setup with version command"
**Validation**: `sandctl --help` and `sandctl version` work

### 7.2 Init Command
- [ ] `cli/commands/init.ts` - Interactive/non-interactive config setup

**Commit**: "Add init command"
**Validation**: Can initialize config, credentials validated

### 7.3 List Command
- [ ] `cli/commands/list.ts` - List sessions with provider sync

**Commit**: "Add list command"
**Validation**: Lists active sessions in table format

### 7.4 New Command
- [ ] `cli/commands/new.ts` - Full VM provisioning workflow

**Commit**: "Add new command"
**Validation**: Can provision new VM, session stored

### 7.5 Console & Exec Commands
- [ ] `cli/commands/console.ts` - Interactive SSH console
- [ ] `cli/commands/exec.ts` - Remote command execution

**Commit**: "Add console and exec commands"
**Validation**: Interactive console works, commands execute

### 7.6 Destroy Command
- [ ] `cli/commands/destroy.ts` - VM termination with confirmation

**Commit**: "Add destroy command"
**Validation**: Can destroy sessions

### 7.7 Template Commands
- [ ] `cli/commands/template/add.ts`
- [ ] `cli/commands/template/list.ts`
- [ ] `cli/commands/template/show.ts`
- [ ] `cli/commands/template/edit.ts`
- [ ] `cli/commands/template/remove.ts`

**Commit**: "Add template subcommands"
**Validation**: All template operations work

---

## Phase 8: E2E Tests
**Goal**: Port test suite to Bun test runner

- [ ] `tests/e2e/cli.test.ts` - Full workflow tests
- [ ] Match existing Go E2E test coverage

**Commit**: "Add E2E test suite"
**Validation**: All E2E tests pass

---

## Phase 9: Build & Distribution
**Goal**: Single-file executable

- [ ] `bun build --compile` for native executable
- [ ] Test on macOS (arm64, amd64) and Linux

**Commit**: "Add build configuration"
**Validation**: Binary runs on target platforms

---

## Dependency Order

```
Phase 1 (Foundation)
    ↓
Phase 2 (Storage) ←── Can commit each store independently
    ↓
Phase 3 (Provider Interface)
    ↓
Phase 4 (Hetzner) ←┬── Can work in parallel
Phase 5 (SSH)     ←┘
    ↓
Phase 6 (UI)
    ↓
Phase 7 (Commands) ←── Each command can be committed independently
    ↓
Phase 8 (E2E Tests)
    ↓
Phase 9 (Build)
```

---

## Key Files to Reference

| Go File | Purpose |
|---------|---------|
| `internal/provider/interface.go` | Provider contract |
| `internal/config/config.go` | Config structure |
| `internal/session/store.go` | Session persistence |
| `internal/sshexec/client.go` | SSH patterns |
| `internal/cli/new.go` | Full integration example |
| `internal/hetzner/provider.go` | Hetzner API usage |

---

## Verification Strategy

Each phase includes:
1. **Unit tests** for individual functions
2. **Integration point** validation (can load real files)
3. **Manual smoke test** for user-facing features

Final verification:
- Run full E2E suite with real Hetzner credentials
- Test `sandctl new` → `sandctl exec` → `sandctl destroy` workflow
