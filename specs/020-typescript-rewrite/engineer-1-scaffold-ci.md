# Engineer 1 — Scaffold, CI/CD, E2E & Polish

**Stream**: A (Lead)
**PRs**: PR-01, PR-08, PR-09, PR-16, PR-18

## Ownership

You own the project foundation and integration layers:

| Module | Files |
|--------|-------|
| Project scaffold | `package.json`, `tsconfig.json`, `bunfig.toml`, `biome.json`, `Makefile`, `scripts/`, `.gitignore` |
| CLI entry point | `src/index.ts` |
| Version command | `src/commands/version.ts` |
| CI/CD | `.github/workflows/ci.yml` |
| E2E tests | `tests/e2e/cli.test.ts` |
| Polish & docs | `README.md`, `CLAUDE.md` |

---

## PR-01: Project Scaffold (Tasks T001–T011)

**Blocked by**: Nothing — you start first
**Blocks**: ALL other PRs

### What to Build

Initialize the Bun/TypeScript project from scratch. This PR replaces the Go build system entirely.

1. **`package.json`** — Create with:
   - `"name": "sandctl"`, `"type": "module"`
   - Scripts: `build`, `build-all`, `test`, `test:unit`, `test:e2e`, `lint`, `fmt`, `check-fmt`
   - See `plan.md` → Build Configuration for exact script definitions

2. **`tsconfig.json`** — Strict mode, ESNext target, Bun module resolution, path aliases (`@/` → `src/`), include `src/` and `tests/`

3. **`bunfig.toml`** — Test runner config (preload, coverage settings)

4. **`biome.json`** — Linter and formatter rules (recommended preset). This replaces `.golangci.yml`

5. **Install dependencies** — `commander`, `yaml`, `ssh2`, `ora`, `chalk`, `@inquirer/prompts` and their `@types/*` packages

6. **`src/index.ts`** — Minimal CLI entry point:
   ```typescript
   import { Command } from "commander";
   const program = new Command()
     .name("sandctl")
     .description("Manage sandboxed AI web development agents")
     .option("--config <path>", "Config file path", "~/.sandctl/config")
     .option("-v, --verbose", "Enable verbose debug output");
   program.parse();
   ```

7. **`Makefile`** — Update with Bun targets: `build`, `build-all`, `test`, `lint`, `fmt`, `clean`, `install`

8. **`scripts/build-all.sh`** — Cross-compile for darwin-arm64, darwin-x64, linux-x64, linux-arm64

9. **`.gitignore`** — Add `node_modules/`, `*.tsbuildinfo`, `dist/`, `sandctl` (binary). Remove Go-specific entries (`*.test` binary, `vendor/`)

10. **Remove Go files** — Delete `go.mod`, `go.sum`, `tools.go`, `cmd/`, `internal/`. Keep `specs/`, `tests/` (to be rewritten), `README.md`, `.github/`, `.specify/`

### How to Verify

```bash
# Project builds to native binary
bun build src/index.ts --compile --outfile sandctl

# Binary runs without external runtime
./sandctl --help
# Should print: "Usage: sandctl [options] [command]" with description

# Lint passes
bun run lint

# Format check passes
bun run check-fmt

# Tests run (even if no tests yet)
bun test
```

### Constitution Compliance

- **I. Code Quality**: `biome.json` enforces consistent style; `tsconfig.json` strict mode enforces type safety
- **II. Performance**: Verify `./sandctl --help` startup time is <200ms: `time ./sandctl --help`
- **III. Security**: No secrets in committed files; `.gitignore` excludes `.env*`
- **V. E2E Testing**: E2E infrastructure set up (tests will invoke compiled binary, not import source)

---

## PR-08: CI Workflow (Tasks T074–T076)

**Blocked by**: PR-01
**Blocks**: Nothing (can iterate)

### What to Build

Replace Go CI jobs with Bun equivalents in `.github/workflows/ci.yml`:

1. **Lint job**: Install Bun → `bun run lint`
2. **Test job**: Install Bun → `bun test`
3. **Build job**: Install Bun → `bun run build` → upload artifact
4. **E2E job** (conditional): Build binary → generate SSH key → run E2E tests with `HETZNER_API_TOKEN` secret

Update `Makefile` to inject version/commit/build-time into the binary via a generated `src/version.ts` file.

### How to Verify

```bash
# Lint job would pass
bun run lint

# Test job would pass
bun test

# Build job would pass
bun run build
ls -la sandctl  # binary exists

# Version info is injected
./sandctl version
# Should print version, commit, build time
```

### Constitution Compliance

- **Quality Gates**: CI must enforce lint, type check, unit tests, and E2E tests before merge
- All gates from the constitution table must have corresponding CI jobs

---

## PR-09: Version Command (Task T043)

**Blocked by**: PR-01
**Blocks**: Nothing

### What to Build

Implement `src/commands/version.ts`:

```typescript
// Output format must match Go version exactly:
// sandctl version <VERSION>
//   commit: <COMMIT>
//   built:  <BUILD_TIME>
```

Wire build info from a generated `src/version.ts` (created by Makefile at build time) or `package.json` version as fallback.

### How to Verify

```bash
# Build with version injection
make build

# Version command works
./sandctl version
# Output: "sandctl version dev\n  commit: unknown\n  built:  unknown"

# Dev mode defaults work when not built via make
bun run src/index.ts version
```

### Constitution Compliance

- **I. Code Quality**: Single-purpose module, clear naming
- **V. E2E Testing**: `sandctl version` is the simplest E2E test case — binary invocation, verify stdout

---

## PR-16: E2E Test Suite (Tasks T077–T079)

**Blocked by**: PR-05, PR-06, PR-07, PR-13, PR-14, PR-15 (all commands must be merged)
**Blocks**: PR-18

### What to Build

Port all E2E test scenarios from Go (`tests/e2e/cli_test.go`) to TypeScript:

1. **`tests/e2e/cli.test.ts`** — Test scenarios:
   - `sandctl version` prints version info
   - `sandctl init` creates config with correct permissions (0600)
   - `sandctl new` provisions a VM (requires Hetzner token)
   - `sandctl list` shows the session
   - `sandctl exec <name> -c "echo hello"` returns "hello"
   - `sandctl destroy <name> --force` removes the session
   - Full workflow lifecycle: init → new → list → exec → destroy

2. **`tests/e2e/helpers.ts`** — Test utilities:
   - Binary execution wrapper (spawn process, capture stdout/stderr/exit code)
   - Temp config file management (isolated `--config` per test)
   - Cleanup utilities (destroy any sessions created during tests)

3. **Template E2E scenarios**:
   - `sandctl template add test-tmpl` creates template
   - `sandctl template list` shows the template
   - `sandctl template show test-tmpl` prints init script
   - `sandctl template remove test-tmpl --force` deletes it
   - `sandctl new -T test-tmpl` uses template during provisioning

### How to Verify

```bash
# Run E2E tests (requires HETZNER_API_TOKEN env var)
HETZNER_API_TOKEN=<token> bun test tests/e2e/

# Tests must invoke compiled binary, not import source
grep -r "from.*src/" tests/e2e/  # Should find NOTHING

# Tests must not access internal state
grep -r "sessions.json" tests/e2e/  # Should find NOTHING (use CLI output only)
```

### Constitution Compliance

- **V. E2E Testing**: This is the critical constitution principle for your work:
  - Tests MUST invoke `./sandctl <command>` as a user would
  - Tests MUST treat the binary as a black box
  - Tests MUST NOT import application code
  - Tests MUST NOT read internal files (sessions.json, config)
  - Tests MUST assert on user-visible output and exit codes only
  - Tests MUST remain stable across internal refactoring

---

## PR-18: Final Polish (Tasks T080–T086)

**Blocked by**: PR-16, PR-17
**Blocks**: Nothing — this ships

### What to Build

1. Verify backward compatibility: load existing Go-generated config and session files
2. Verify error messages match `[error]` format with helpful suggestions
3. Verify exit codes: 0, 2, 3, 4, 5 match spec
4. Verify binary size is within 2x of Go binary
5. Verify startup time under 200ms
6. Remove `.golangci.yml` and any remaining Go references

### How to Verify

```bash
# Backward compat: create a config with Go binary, load with TS binary
# (manual test — document results)

# Error format check
./sandctl list 2>&1 | head -1
# Should show "[error] ..." format if config missing

# Exit codes
./sandctl list; echo $?  # Should be 2 (config error) if no config

# Binary size
ls -la sandctl
# Compare with Go binary size from previous release

# Startup time
time ./sandctl --help  # Must be under 200ms
```

### Constitution Compliance

- **II. Performance**: Binary size and startup time checks
- **III. Security**: Final audit — no secrets in source, config permissions correct
- **IV. User Privacy**: Verify no analytics/telemetry was added
