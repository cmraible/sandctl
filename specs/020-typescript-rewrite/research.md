# Research: Rewrite sandctl in TypeScript with Bun

**Feature**: 020-typescript-rewrite
**Date**: 2026-02-20

## Research Questions

### RQ-1: What CLI framework should replace Cobra?

**Decision**: `commander` (npm)

**Rationale**: Commander is the most mature and widely-used CLI framework in the Node.js ecosystem. It provides subcommand support, flag parsing, help generation, and argument validation — all features used in the Go Cobra implementation. It has zero dependencies and works with Bun.

**Alternatives Considered**:
- `yargs`: Heavier, more complex API, less idiomatic for TypeScript
- `clipanion`: Type-safe but less community support
- `oclif`: Too opinionated (Salesforce framework), overkill for this project
- `citty`: Lightweight but newer, smaller ecosystem

---

### RQ-2: What SSH library should be used?

**Decision**: `ssh2` (npm)

**Rationale**: `ssh2` is the only mature, full-featured SSH client library for Node.js/Bun. It supports:
- Password, public key, and SSH agent authentication
- Command execution with stdout/stderr capture
- Interactive PTY sessions with window resize
- SFTP file transfer
- Agent forwarding

It has been maintained since 2013 and has 5M+ weekly downloads. Bun has good compatibility with native Node.js modules.

**Risks**:
- PTY/raw terminal mode in Bun-compiled binaries needs early testing
- SSH agent socket communication should work via Bun's Unix socket support
- Fallback: shell out to system `ssh` binary for interactive console if `ssh2` PTY has issues

---

### RQ-3: How should the Hetzner API be accessed?

**Decision**: Use `fetch` (Bun built-in) with direct REST API calls

**Rationale**: The official `@hetznercloud/hcloud-js` SDK exists but may have compatibility issues with Bun (it's designed for Node.js). Using `fetch` directly against the Hetzner REST API is simpler, has zero dependencies, and avoids compatibility concerns. The API surface needed is small:
- `POST /servers` (create)
- `GET /servers/{id}` (get)
- `DELETE /servers/{id}` (delete)
- `GET /servers` (list)
- `POST /ssh_keys` (create SSH key)
- `GET /ssh_keys` (list SSH keys)
- `GET /datacenters` (validate credentials)

**Alternative**: `@hetznercloud/hcloud-js` — revisit if the REST approach becomes cumbersome.

---

### RQ-4: How should YAML be parsed?

**Decision**: `yaml` npm package (formerly `js-yaml`)

**Rationale**: The `yaml` package produces output compatible with Go's `gopkg.in/yaml.v3`. Both libraries handle the same YAML 1.2 spec. Key compatibility points:
- Field naming: YAML uses `snake_case` keys, both libraries respect this
- Null handling: Both omit null/zero-value fields by default
- String quoting: Both use plain scalars for simple strings

**Verification needed**: Test that a YAML file written by Go's yaml.v3 can be read by the TypeScript `yaml` package and vice versa.

---

### RQ-5: How should interactive prompts work?

**Decision**: `@inquirer/prompts` (npm)

**Rationale**: Inquirer is the standard for interactive CLI prompts in Node.js. It supports:
- Text input with defaults
- Password/secret input (masked)
- Select lists (arrow key navigation)
- Confirm (yes/no with defaults)

The `@inquirer/prompts` package (v2+) is ESM-native and tree-shakeable, working well with Bun.

**Alternative**: `prompts` (npm) — lighter weight but less feature-rich.

---

### RQ-6: How should the binary be compiled?

**Decision**: `bun build --compile` with cross-compilation targets

**Implementation**:
```bash
# Native build
bun build src/index.ts --compile --outfile sandctl

# Cross-compilation
bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile dist/sandctl-darwin-arm64
bun build src/index.ts --compile --target=bun-darwin-x64 --outfile dist/sandctl-darwin-x64
bun build src/index.ts --compile --target=bun-linux-x64 --outfile dist/sandctl-linux-x64
bun build src/index.ts --compile --target=bun-linux-arm64 --outfile dist/sandctl-linux-arm64
```

**Version injection**: Use a generated `src/version.ts` file created at build time (written by Makefile) or use `Bun.env` at build time:
```typescript
// src/version.ts (generated at build time)
export const VERSION = "1.0.0";
export const COMMIT = "abc1234";
export const BUILD_TIME = "2026-02-20T00:00:00Z";
```

---

### RQ-7: What linter/formatter should be used?

**Decision**: Biome (replaces ESLint + Prettier)

**Rationale**: Biome is a fast, all-in-one linter and formatter written in Rust. It's significantly faster than ESLint + Prettier, has zero configuration needed for common rules, and supports TypeScript natively. It's the modern standard for TypeScript projects.

**Configuration**: `biome.json` at repository root with recommended rules enabled.

---

### RQ-8: How should terminal handling work for interactive console?

**Decision**: Use Node.js `process.stdin.setRawMode(true)` + `ssh2` PTY channels

**Implementation**:
```typescript
// Simplified console flow
process.stdin.setRawMode(true);
process.stdin.resume();

const channel = await ssh.requestShell({
  term: process.env.TERM || "xterm-256color",
  cols: process.stdout.columns,
  rows: process.stdout.rows,
});

process.stdin.pipe(channel.stdin);
channel.stdout.pipe(process.stdout);
channel.stderr.pipe(process.stderr);

// Handle window resize
process.stdout.on("resize", () => {
  channel.setWindow(process.stdout.rows, process.stdout.columns, 0, 0);
});
```

**Risks**: Bun's compatibility with raw terminal mode in compiled binaries needs verification. The Go version uses `golang.org/x/term` which handles this natively.

---

### RQ-9: How should atomic file writes work?

**Decision**: Write to temp file + rename (same strategy as Go version)

**Implementation**:
```typescript
import { writeFile, rename, chmod, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function atomicWrite(path: string, content: string, mode: number): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmpPath = join(dir, `.tmp-${Date.now()}`);
  await writeFile(tmpPath, content, { mode });
  await rename(tmpPath, path);
}
```

This preserves the Go version's behavior of never leaving a partially-written config file.
