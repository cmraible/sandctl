# Implementation Plan: Rewrite sandctl in TypeScript with Bun

**Branch**: `020-typescript-rewrite` | **Date**: 2026-02-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-typescript-rewrite/spec.md`

## Summary

Rewrite the `sandctl` CLI from Go to TypeScript using the Bun runtime, compiled to native executables via `bun build --compile`. The rewrite preserves all user-facing behavior, command structure, config/session file formats, and error handling. The architecture mirrors the Go codebase's modular package structure using TypeScript modules.

**Implementation Strategy**: The TypeScript version will be developed in a `sandctl-ts/` subdirectory at the repository root. The existing Go implementation (`cmd/`, `internal/`, `go.mod`, etc.) will remain untouched and continue to be the primary implementation. Once the TypeScript version reaches full feature parity with the Go implementation and all tests pass, a future decision can be made about replacing the Go version.

## Technical Context

**Language/Version**: TypeScript 5.x on Bun 1.x runtime
**Primary Dependencies**:
- `commander` (CLI framework, replaces Cobra)
- `yaml` (YAML parsing, replaces gopkg.in/yaml.v3)
- `ssh2` (SSH client, replaces golang.org/x/crypto/ssh)
- `ora` (terminal spinners, replaces briandowns/spinner)
- `chalk` (colored output)
- `inquirer` (interactive prompts, replaces golang.org/x/term for input)

**Storage**: YAML file at `~/.sandctl/config` (0600), JSON at `~/.sandctl/sessions.json` — identical formats to Go version
**Testing**: Bun's built-in test runner (`bun test`), E2E tests with compiled binary
**Target Platform**: macOS (arm64, amd64), Linux (amd64, arm64) — compiled via `bun build --compile --target`
**Project Type**: Single CLI project
**Performance Goals**: <200ms startup, binary size within 2x of Go version
**Constraints**: Must maintain backward compatibility with existing Go config/session files
**Scale/Scope**: Single-user CLI tool

## Constitution Check

### I. Code Quality
- [x] **Readability**: TypeScript provides strong typing; module structure mirrors Go packages
- [x] **Single Responsibility**: Each module handles one concern (config, session, provider, ssh, ui)
- [x] **Type Safety**: TypeScript interfaces mirror Go structs; strict mode enabled
- [x] **No Dead Code**: Clean rewrite eliminates legacy patterns
- [x] **Consistent Style**: Biome for consistent linting and formatting

### II. Performance
- [x] **Measurable Goals**: <200ms startup time, binary size within 2x of Go
- [x] **Baseline Testing**: Compare against Go binary for startup and memory
- [x] **Resource Efficiency**: Bun's native compilation optimizes for size/speed
- [x] **Scalability Consideration**: N/A — single-user CLI tool

### III. Security
- [x] **Defense in Depth**: Config file 0600 permissions, secrets never logged
- [x] **Input Validation**: Email validation, SSH key path validation, flag conflict detection
- [x] **Secrets Management**: GitHub token passed via SSH stdin, masked in prompts
- [x] **Dependency Hygiene**: Minimal dependencies, all well-maintained npm packages
- [x] **Least Privilege**: Same security model as Go version

### IV. User Privacy
- [x] **Data Minimization**: Only essential config data collected
- [x] **Transparency**: Clear prompts explain data usage
- [x] **User Control**: All settings optional, user controls deletion
- [x] **Retention Limits**: Local storage only
- [x] **No Surveillance**: No analytics or telemetry

### V. End-to-End Testing Philosophy
- [x] **User-Centric Invocation**: E2E tests invoke compiled binary with CLI arguments
- [x] **Black-Box Testing**: Tests verify command output and side effects, not internals
- [x] **Implementation Independence**: Same E2E test scenarios as Go version
- [x] **Decoupling Enforcement**: Tests use CLI commands only
- [x] **Behavioral Contracts**: Tests verify identical user-facing behavior to Go version

## Project Structure

### Documentation

```text
specs/020-typescript-rewrite/
├── spec.md              # Feature specification
├── plan.md              # This file
├── tasks.md             # Implementation tasks
└── checklists/          # Verification checklists
```

### Source Code (sandctl-ts/ subdirectory at repository root)

```text
sandctl-ts/                         # New TypeScript implementation subdirectory
├── src/
│   ├── index.ts                    # CLI entry point (replaces cmd/sandctl/main.go)
│   ├── commands/                   # Command implementations (replaces internal/cli/)
│   │   ├── init.ts                 # sandctl init
│   │   ├── new.ts                  # sandctl new
│   │   ├── list.ts                 # sandctl list
│   │   ├── console.ts              # sandctl console
│   │   ├── exec.ts                 # sandctl exec
│   │   ├── destroy.ts              # sandctl destroy
│   │   ├── version.ts              # sandctl version
│   │   └── template/               # sandctl template subcommands
│   │       ├── index.ts            # template parent command
│   │       ├── add.ts              # template add
│   │       ├── list.ts             # template list
│   │       ├── show.ts             # template show
│   │       ├── edit.ts             # template edit
│   │       └── remove.ts           # template remove
│   ├── config/                     # Configuration management (replaces internal/config/)
│   │   ├── config.ts               # Config types, load, validate
│   │   └── writer.ts               # Atomic config write with permissions
│   ├── session/                    # Session management (replaces internal/session/)
│   │   ├── types.ts                # Session types, status
│   │   ├── store.ts                # JSON session store CRUD
│   │   ├── id.ts                   # Human-readable ID generation
│   │   └── names.ts                # 250-name pool
│   ├── provider/                   # Provider plugin system (replaces internal/provider/)
│   │   ├── interface.ts            # Provider & SSHKeyManager interfaces
│   │   ├── registry.ts             # Provider factory registry
│   │   ├── types.ts                # VM, CreateOpts, VMStatus types
│   │   └── errors.ts               # Provider error types
│   ├── hetzner/                    # Hetzner provider (replaces internal/hetzner/)
│   │   ├── client.ts               # Hetzner API client (REST or SDK)
│   │   ├── provider.ts             # Provider interface implementation
│   │   ├── ssh-keys.ts             # SSH key management
│   │   └── setup.ts                # Cloud-init script generation
│   ├── ssh/                        # SSH execution (replaces internal/sshexec/ + sshagent/)
│   │   ├── client.ts               # SSH client wrapper
│   │   ├── exec.ts                 # Command execution via SSH
│   │   ├── console.ts              # Interactive PTY console
│   │   └── agent.ts                # SSH agent discovery & integration
│   ├── ui/                         # User interface utilities (replaces internal/ui/)
│   │   ├── errors.ts               # Error formatting with exit codes
│   │   ├── progress.ts             # Spinner and progress steps
│   │   ├── prompt.ts               # Interactive prompts
│   │   └── table.ts                # Table formatting
│   └── utils/                      # Shared utilities
│       └── paths.ts                # Path expansion (~ handling)
├── tests/
│   ├── unit/                       # Unit tests (mirror src/ structure)
│   │   ├── config/
│   │   │   ├── config.test.ts
│   │   │   └── writer.test.ts
│   │   ├── session/
│   │   │   ├── id.test.ts
│   │   │   ├── names.test.ts
│   │   │   ├── store.test.ts
│   │   │   └── types.test.ts
│   │   ├── ui/
│   │   │   ├── errors.test.ts
│   │   │   ├── progress.test.ts
│   │   │   ├── prompt.test.ts
│   │   │   └── table.test.ts
│   │   └── commands/
│   │       └── init.test.ts
│   └── e2e/
│       └── cli.test.ts             # E2E tests with compiled binary
├── package.json                    # Project manifest
├── tsconfig.json                   # TypeScript configuration
├── bunfig.toml                     # Bun configuration
├── biome.json                      # Linter/formatter config (Biome replaces ESLint+Prettier)
├── Makefile                        # Build automation for TypeScript version
├── scripts/
│   └── build-all.sh                # Cross-platform compilation script
└── README.md                       # TypeScript version documentation
```

**Note**: The existing Go implementation at the repository root (`cmd/`, `internal/`, `go.mod`, etc.) remains unchanged. The TypeScript version lives entirely within `sandctl-ts/` until it reaches parity.

### Build Configuration

**package.json** key fields (in `sandctl-ts/package.json`):
```json
{
  "name": "sandctl",
  "type": "module",
  "scripts": {
    "build": "bun build src/index.ts --compile --outfile sandctl",
    "build-all": "scripts/build-all.sh",
    "test": "bun test",
    "test:unit": "bun test tests/unit/",
    "test:e2e": "bun test tests/e2e/",
    "lint": "biome check src/ tests/",
    "fmt": "biome format --write src/ tests/",
    "check-fmt": "biome format src/ tests/"
  }
}
```

**Cross-compilation targets** (in `sandctl-ts/scripts/build-all.sh`):
- `bun build --compile --target=bun-darwin-arm64`
- `bun build --compile --target=bun-darwin-x64`
- `bun build --compile --target=bun-linux-x64`
- `bun build --compile --target=bun-linux-arm64`

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

### Complexity 1: SSH PTY Support in Bun

**Violation**: Bun's compatibility with the `ssh2` library's PTY/interactive terminal features may have edge cases.
**Justification**: SSH interactive console is a core feature (P1). If `ssh2` has issues with Bun-compiled binaries, we may need to shell out to the system `ssh` binary as a fallback.
**Mitigation**: Test PTY support early in development; implement fallback to system SSH if needed.

### Complexity 2: SSH Agent Discovery

**Violation**: SSH agent socket discovery (1Password, gpg-agent) requires reading `~/.ssh/config` and probing Unix sockets.
**Justification**: This is existing behavior that must be preserved. Bun supports Unix sockets, but the `ssh2` library's agent support may differ from Go's implementation.
**Mitigation**: Port the exact discovery logic from Go; test with 1Password and standard ssh-agent.
