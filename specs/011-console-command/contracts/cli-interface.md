# CLI Interface Contract: Console Command

**Feature**: 011-console-command
**Date**: 2026-01-25

## Command Signature

```
sandctl console <session-name>
```

## Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `session-name` | string | Yes | Name of the session to connect to (e.g., "alice") |

## Flags

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--config` | | string | `~/.sandctl/config` | Path to config file (inherited from root) |
| `--verbose` | `-v` | bool | false | Enable verbose output (inherited from root) |

**Note**: The `console` command intentionally has no command-specific flags. It is designed for simplicity—just `sandctl console <name>`.

## Behavior

### Success Flow

1. User runs `sandctl console alice`
2. Command validates:
   - stdin is a terminal (not piped)
   - Session "alice" exists in local store
   - Sprite "alice" is in "running" or "warm" state
3. Command displays: `Connecting to alice...`
4. WebSocket connection established
5. Command displays: `Connected. Press Ctrl+D to exit.`
6. Interactive shell session begins
7. User interacts with remote shell
8. User exits (Ctrl+D or `exit` command)
9. Command restores terminal and exits with code 0

### Error Flows

#### Non-Terminal Input

```
$ echo "ls" | sandctl console alice
Error: console requires an interactive terminal
Use 'sandctl exec alice -c <command>' for non-interactive execution.
```
Exit code: 1

#### Session Not Found

```
$ sandctl console unknown
Error: session 'unknown' not found
Run 'sandctl list' to see available sessions.
```
Exit code: 4

#### Session Not Running

```
$ sandctl console alice
Error: session 'alice' is not running (status: stopped)
Cannot connect to stopped sessions.
```
Exit code: 5

#### Connection Failed

```
$ sandctl console alice
Connecting to alice...
Error: failed to connect: connection refused
```
Exit code: 3

## Output Format

### Standard Output

Interactive terminal session output (passthrough from remote shell).

### Standard Error

- Connection status messages
- Error messages
- Verbose logging (when `-v` enabled)

## Exit Codes

| Code | Constant | Meaning |
|------|----------|---------|
| 0 | `ExitSuccess` | Session ended normally |
| 1 | `ExitGeneralError` | General error (including non-terminal stdin) |
| 2 | `ExitConfigError` | Configuration error |
| 3 | `ExitAPIError` | API/connection error |
| 4 | `ExitSessionNotFound` | Session not found |
| 5 | `ExitSessionNotReady` | Session not in running state |

## Signal Handling

| Signal | Behavior |
|--------|----------|
| SIGINT (Ctrl+C) | Passed to remote process |
| SIGTERM | Gracefully close connection, restore terminal |
| SIGWINCH | Propagate new terminal dimensions to remote (if supported) |
| EOF (Ctrl+D) | Close session, restore terminal |

## Terminal Requirements

- **Raw mode**: Required for proper key handling
- **Dimensions**: Detected at start, resize events propagated
- **Restoration**: Terminal state restored on exit (all exit paths)

## Examples

### Basic Usage

```bash
# Connect to a running session
sandctl console alice

# With verbose output
sandctl console alice -v

# With custom config
sandctl console alice --config /path/to/config
```

### Typical Session

```
$ sandctl console alice
Connecting to alice...
Connected. Press Ctrl+D to exit.
user@sprite:~$ ls -la
total 32
drwxr-xr-x 4 user user 4096 Jan 25 10:00 .
drwxr-xr-x 3 root root 4096 Jan 25 09:00 ..
-rw-r--r-- 1 user user  220 Jan 25 09:00 .bash_logout
...
user@sprite:~$ exit
$
```

## Comparison with `exec` Command

| Feature | `console` | `exec` |
|---------|-----------|--------|
| Interactive terminal | ✅ Always | ✅ Default |
| Single command (`-c`) | ❌ Not supported | ✅ Supported |
| Piped input | ❌ Rejected | ✅ Allowed |
| Use case | "SSH into sandbox" | "Run commands in sandbox" |
