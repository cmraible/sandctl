# Engineer 6 — SSH Module, Console, Exec & Agent

**Stream**: F
**PRs**: PR-11, PR-12, PR-14, PR-15

## Ownership

You own all SSH connectivity — the bridge between the local CLI and remote sandboxes:

| Module | Files |
|--------|-------|
| SSH client | `sandctl-ts/src/ssh/client.ts` |
| SSH exec | `sandctl-ts/src/ssh/exec.ts` |
| SSH console | `sandctl-ts/src/ssh/console.ts` |
| SSH agent | `sandctl-ts/src/ssh/agent.ts` |
| Console command | `sandctl-ts/src/commands/console.ts` |
| Exec command | `sandctl-ts/src/commands/exec.ts` |

---

## PR-11: SSH Client, Exec & Console (Tasks T039–T041)

**Blocked by**: PR-02 (config types — for SSH key path/agent config)
**Blocks**: PR-12 (agent), PR-13 (new cmd), PR-14 (console cmd), PR-15 (exec cmd)

### What to Build

#### 1. SSH Client (`sandctl-ts/src/ssh/client.ts`)

Wrapper around the `ssh2` library:

```typescript
import { Client as SSH2Client } from "ssh2";

interface SSHClientOptions {
  host: string;
  port?: number;           // Default: 22
  username?: string;        // Default: "root"
  privateKeyPath?: string;  // Path to private key file
  useAgent?: boolean;       // Use SSH agent
  agentSocket?: string;     // Custom agent socket path
  timeout?: number;         // Connection timeout in ms (default: 10000)
}

export class SSHClient {
  constructor(options: SSHClientOptions);

  async connect(): Promise<void>;
  // Connects using agent (if useAgent) or private key file
  // Tries agent first, falls back to key file
  // Respects timeout

  async close(): Promise<void>;
  // Closes connection cleanly
}
```

Connection logic:
1. If `useAgent` is true: connect using SSH agent socket
2. If `privateKeyPath` is set: read key file, pass to ssh2
3. Handle passphrase-protected keys (read from agent if available)
4. Set connection timeout
5. Handle connection errors with clear messages

#### 2. SSH Command Execution (`sandctl-ts/src/ssh/exec.ts`)

```typescript
interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function exec(client: SSHClient, command: string): Promise<ExecResult>;
// Run command, capture stdout/stderr, return exit code

export async function execWithStreams(
  client: SSHClient,
  command: string,
  options?: { stdin?: string }
): Promise<ExecResult>;
// Run command with custom stdin (for passing tokens)

export async function checkConnection(host: string, port?: number, timeout?: number): Promise<boolean>;
// TCP probe — returns true if port is reachable
// Used by provider.waitReady() to check if SSH is up
```

`exec()` implementation:
- Open channel via `client.exec(command)`
- Collect stdout and stderr into buffers
- Wait for channel close event
- Return collected output and exit code

`execWithStreams()` — same as exec but:
- Write `options.stdin` to channel.stdin before closing it
- Used for `gh auth login --with-token` (pass token via stdin)

`checkConnection()`:
- Create raw TCP socket to `host:port`
- Return true if connection established within timeout
- Return false on any error (don't throw)

#### 3. Interactive Console (`sandctl-ts/src/ssh/console.ts`)

This is the most complex SSH feature — interactive PTY terminal:

```typescript
interface ConsoleOptions {
  term?: string;   // Default: process.env.TERM || "xterm-256color"
  cols?: number;   // Default: process.stdout.columns
  rows?: number;   // Default: process.stdout.rows
}

export async function openConsole(client: SSHClient, options?: ConsoleOptions): Promise<void>;
```

Implementation:

```typescript
export async function openConsole(client: SSHClient, options?: ConsoleOptions): Promise<void> {
  // 1. Request PTY shell
  const channel = await client.requestShell({
    term: options?.term || process.env.TERM || "xterm-256color",
    cols: options?.cols || process.stdout.columns || 80,
    rows: options?.rows || process.stdout.rows || 24,
  });

  // 2. Set raw mode on local terminal
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();

  // 3. Pipe I/O
  process.stdin.pipe(channel.stdin);
  channel.stdout.pipe(process.stdout);
  channel.stderr.pipe(process.stderr);

  // 4. Handle terminal resize (SIGWINCH)
  const onResize = () => {
    channel.setWindow(
      process.stdout.rows || 24,
      process.stdout.columns || 80,
      0, 0
    );
  };
  process.stdout.on("resize", onResize);

  // 5. Wait for channel close
  await new Promise<void>((resolve) => {
    channel.on("close", () => {
      // 6. Restore terminal
      process.stdin.setRawMode(wasRaw || false);
      process.stdin.unpipe(channel.stdin);
      process.stdin.pause();
      process.stdout.removeListener("resize", onResize);
      resolve();
    });
  });
}
```

**Critical**: The terminal MUST be restored to its original state when the console exits, even on error. Use try/finally.

### How to Verify

```bash
# Test SSH connection to a running VM (need a VM — coordinate with Engineer 5)
bun -e "
import { SSHClient } from './src/ssh/client.ts';
const client = new SSHClient({ host: '<vm-ip>', privateKeyPath: '~/.ssh/id_ed25519' });
await client.connect();
console.log('Connected!');
await client.close();
"

# Test command execution
bun -e "
import { SSHClient } from './src/ssh/client.ts';
import { exec } from './src/ssh/exec.ts';
const client = new SSHClient({ host: '<vm-ip>', privateKeyPath: '~/.ssh/id_ed25519' });
await client.connect();
const result = await exec(client, 'echo hello');
console.log(result);  // { stdout: 'hello\n', stderr: '', exitCode: 0 }
await client.close();
"

# Test connection check
bun -e "
import { checkConnection } from './src/ssh/exec.ts';
console.log(await checkConnection('<vm-ip>', 22, 5000));  // true
console.log(await checkConnection('192.0.2.1', 22, 2000));  // false (timeout)
"

# Test interactive console (requires TTY — run in terminal, not piped)
bun -e "
import { SSHClient } from './src/ssh/client.ts';
import { openConsole } from './src/ssh/console.ts';
const client = new SSHClient({ host: '<vm-ip>', privateKeyPath: '~/.ssh/id_ed25519' });
await client.connect();
await openConsole(client);
await client.close();
"
# Should open interactive shell — type 'exit' to close
# Verify: terminal is restored to normal after exit (echo works, cursor visible)

# Test stdin streaming (for token passing)
bun -e "
import { SSHClient } from './src/ssh/client.ts';
import { execWithStreams } from './src/ssh/exec.ts';
const client = new SSHClient({ host: '<vm-ip>', privateKeyPath: '~/.ssh/id_ed25519' });
await client.connect();
const result = await execWithStreams(client, 'cat', { stdin: 'hello from stdin' });
console.log(result.stdout);  // 'hello from stdin'
await client.close();
"

# Lint check
bun run lint
```

### Constitution Compliance

- **I. Code Quality**: Client, exec, and console are separate modules with clear interfaces
- **I. Type Safety**: `ExecResult` strongly typed; `SSHClientOptions` defines all connection params
- **III. Security**: Private keys read from file (not logged); agent socket paths validated
- **III. Secrets Management**: `execWithStreams` passes secrets via stdin (not command args — command args would appear in `ps` output on the remote)
- **II. Performance**: `checkConnection` has bounded timeout; doesn't hang on unreachable hosts

---

## PR-12: SSH Agent Discovery (Tasks T042, T070–T073)

**Blocked by**: PR-11 (SSH client)
**Blocks**: PR-13 (new cmd with agent mode)

### What to Build

#### SSH Agent (`sandctl-ts/src/ssh/agent.ts`)

Port the agent discovery logic from Go's `internal/sshagent/agent.go`:

```typescript
interface AgentKey {
  type: string;           // e.g., "ssh-ed25519"
  fingerprint: string;    // SHA256:...
  comment: string;
  publicKey: Buffer;
}

export class SSHAgent {
  constructor(socketPath: string);

  static async discover(): Promise<SSHAgent>;
  // Discovery priority:
  // 1. Parse ~/.ssh/config for IdentityAgent directive
  // 2. Check 1Password socket: ~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock
  // 3. Fall back to SSH_AUTH_SOCK environment variable
  // Throw if no agent found

  async listKeys(): Promise<AgentKey[]>;
  // List all keys loaded in the agent

  async getKeyByFingerprint(fingerprint: string): Promise<AgentKey | undefined>;
  // Find specific key by SHA256 fingerprint

  isAvailable(): boolean;
  keyCount(): number;
}
```

Discovery details:

1. **~/.ssh/config parsing**: Look for `IdentityAgent` directive:
   ```
   Host *
     IdentityAgent ~/.ssh/agent.sock
   ```
   Or 1Password-style:
   ```
   Host *
     IdentityAgent "~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
   ```

2. **1Password detection**: Check if 1Password socket exists at known path

3. **SSH_AUTH_SOCK**: Standard environment variable

4. **Validation**: Probe socket to verify it's responsive before returning

Integration with SSHClient: when `useAgent: true`, the client uses the discovered agent socket for authentication.

### How to Verify

```bash
# Test agent discovery (if you have ssh-agent or 1Password running)
bun -e "
import { SSHAgent } from './src/ssh/agent.ts';
const agent = await SSHAgent.discover();
const keys = await agent.listKeys();
console.log('Found', keys.length, 'keys:');
for (const key of keys) {
  console.log(\`  \${key.type} \${key.fingerprint} \${key.comment}\`);
}
"

# Test with specific fingerprint
bun -e "
import { SSHAgent } from './src/ssh/agent.ts';
const agent = await SSHAgent.discover();
const key = await agent.getKeyByFingerprint('SHA256:...');
console.log(key ? 'Found key' : 'Key not found');
"

# Test no-agent scenario
SSH_AUTH_SOCK= bun -e "
import { SSHAgent } from './src/ssh/agent.ts';
try {
  await SSHAgent.discover();
} catch (e) {
  console.log('Expected error:', e.message);
}
"
# Should throw "No SSH agent found"

# Test SSH connection via agent
bun -e "
import { SSHClient } from './src/ssh/client.ts';
import { exec } from './src/ssh/exec.ts';
const client = new SSHClient({ host: '<vm-ip>', useAgent: true });
await client.connect();
const result = await exec(client, 'echo agent-auth-works');
console.log(result.stdout);
await client.close();
"

# Unit tests with mock socket paths
bun test tests/unit/ssh/
```

### Constitution Compliance

- **I. Code Quality**: Agent discovery is separate from SSH client; clean interface
- **III. Security**: Socket paths validated before use; no secret key material exposed
- **III. Input Validation**: Fingerprint format validated; socket existence checked

---

## PR-14: Console Command (Task T058)

**Blocked by**: PR-03 (session store), PR-11 (SSH console)
**Blocks**: PR-16 (E2E)

### What to Build

`sandctl console <name>`:

```typescript
// src/commands/console.ts
export function registerConsoleCommand(program: Command): void {
  program
    .command("console <name>")
    .description("Open an interactive SSH console to a running session")
    .action(async (name: string) => {
      // 1. Check stdin is TTY
      if (!process.stdin.isTTY) {
        printError("console requires an interactive terminal");
        process.exit(ExitSessionNotReady);
      }

      // 2. Normalize name (case-insensitive)
      const normalizedName = normalizeName(name);
      validateID(normalizedName);

      // 3. Get session from store
      const session = await store.get(normalizedName);
      // Throws NotFoundError → caught by error handler

      // 4. Check session is running
      if (session.status !== "running") {
        printError(`Session '${session.id}' is not running (status: ${session.status})`);
        process.exit(ExitSessionNotReady);
      }

      // 5. Verify IP address
      if (!session.ip_address) {
        printError(`Session '${session.id}' has no IP address`);
        process.exit(ExitSessionNotReady);
      }

      // 6. Connect and open console
      printInfo(`Connecting to ${session.id} (${session.ip_address})...`);
      const client = new SSHClient({
        host: session.ip_address,
        username: "root",
        // Use agent or key from config
      });
      await client.connect();
      await openConsole(client);
      await client.close();
    });
}
```

### How to Verify

```bash
# Console to running session
./sandctl console <session-name>
# Should open interactive terminal
# Type 'exit' to close
# Terminal should be restored to normal

# Case-insensitive matching
./sandctl console Alice  # Finds "alice"

# Non-TTY context
echo "test" | ./sandctl console alice
# Error: "console requires an interactive terminal"

# Non-existent session
./sandctl console nonexistent
# Error: "[error] Session 'nonexistent' not found..."

# Non-running session
# (stop a session, then try)
./sandctl console stopped-session
# Error: "Session 'stopped-session' is not running (status: stopped)"
```

### Constitution Compliance

- **I. Code Quality**: Simple, focused command — delegates to SSH module
- **III. Input Validation**: TTY check, name validation, status check, IP check
- **V. E2E Testing**: Console is hard to E2E test (interactive) — tested via manual verification + exec as proxy

---

## PR-15: Exec Command (Task T059)

**Blocked by**: PR-03 (session store), PR-11 (SSH exec)
**Blocks**: PR-16 (E2E)

### What to Build

`sandctl exec <name>`:

```typescript
// src/commands/exec.ts
export function registerExecCommand(program: Command): void {
  program
    .command("exec <name>")
    .description("Execute commands in a running session")
    .option("-c, --command <cmd>", "Run a single command")
    .action(async (name: string, options: { command?: string }) => {
      // 1. Normalize name
      const normalizedName = normalizeName(name);
      validateID(normalizedName);

      // 2. Get session
      const session = await store.get(normalizedName);

      // 3. Check running
      if (session.status !== "running") {
        printError(`Session '${session.id}' is not running (status: ${session.status})`);
        process.exit(ExitSessionNotReady);
      }

      // 4. Create SSH client
      const client = new SSHClient({
        host: session.ip_address,
        username: "root",
      });
      await client.connect();

      if (options.command) {
        // Single command mode
        if (program.opts().verbose) {
          console.error(`[debug] Executing command: ${options.command}`);
        }
        const result = await exec(client, options.command);
        process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        await client.close();
        process.exit(result.exitCode);
      } else {
        // Interactive mode
        printInfo(`Connecting to ${session.id} (${session.ip_address})...`);
        await openConsole(client);
        await client.close();
      }
    });
}
```

### How to Verify

```bash
# Single command
./sandctl exec <session-name> -c "echo hello"
# Output: "hello"

# Single command — exit code passthrough
./sandctl exec <session-name> -c "exit 42"; echo $?
# Output: 42

# Single command — stderr
./sandctl exec <session-name> -c "echo error >&2"
# "error" on stderr

# Interactive mode (in TTY)
./sandctl exec <session-name>
# Opens interactive shell

# Verbose mode
./sandctl --verbose exec <session-name> -c "whoami"
# Shows: "[debug] Executing command: whoami"

# Non-existent session
./sandctl exec nonexistent -c "echo test"
# Error with exit code 4

# Non-running session
./sandctl exec stopped-session -c "echo test"
# Error with exit code 5
```

### Constitution Compliance

- **I. Code Quality**: Clean split between single-command and interactive modes
- **III. Input Validation**: Name, status, and IP validated before connection
- **V. E2E Testing**: `exec -c` is the primary E2E verification mechanism — used to confirm sandbox state in E2E tests
