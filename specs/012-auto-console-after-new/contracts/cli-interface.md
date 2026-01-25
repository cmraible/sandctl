# CLI Interface Contract: sandctl new (Updated)

**Version**: 2.0.0 (auto-console behavior)
**Date**: 2026-01-25

## Command Signature

```
sandctl new [flags]
```

## Flags

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| --timeout | -t | duration | "" | Auto-destroy after duration (e.g., 1h, 30m) |
| --no-console | | bool | false | Skip automatic console connection after provisioning |

## Behavior

### Default Behavior (Interactive Terminal)

When stdin is an interactive terminal and `--no-console` is not set:

1. Provision VM with progress indicators
2. Install development tools
3. Install OpenCode
4. Set up OpenCode authentication
5. Display session name
6. Automatically start interactive console session

### Non-Interactive Behavior

When stdin is NOT an interactive terminal OR `--no-console` is set:

1. Provision VM with progress indicators
2. Install development tools
3. Install OpenCode
4. Set up OpenCode authentication
5. Display session name and usage hints
6. Exit (no console session)

## Output Format

### Interactive Mode (Success)

```
Creating new session...
✓ Provisioning VM
✓ Installing development tools
✓ Installing OpenCode
✓ Setting up OpenCode authentication

Session created: <session-name>
Connecting to console...
[interactive console session]
```

### Non-Interactive Mode / --no-console (Success)

```
Creating new session...
✓ Provisioning VM
✓ Installing development tools
✓ Installing OpenCode
✓ Setting up OpenCode authentication

Session created: <session-name>

Use 'sandctl console <session-name>' to connect.
Use 'sandctl destroy <session-name>' when done.
```

### Console Connection Failure

```
Creating new session...
✓ Provisioning VM
✓ Installing development tools
✓ Installing OpenCode
✓ Setting up OpenCode authentication

Session created: <session-name>
Connecting to console...
Error: Failed to connect to console: <error details>

Session was created successfully. Use 'sandctl console <session-name>' to connect manually.
```

## Exit Codes

| Code | Condition |
|------|-----------|
| 0 | Session created successfully (console optional) |
| 1 | Provisioning failed or configuration error |

Note: Console connection failure after successful provisioning returns exit code 0 because the primary operation succeeded.

## Examples

```bash
# Create session and automatically connect (default)
sandctl new

# Create session with timeout, then connect
sandctl new --timeout 2h

# Create session without connecting (for scripts)
sandctl new --no-console

# Create session with timeout, no console (for automation)
sandctl new --timeout 1h --no-console
```

## Backward Compatibility

- Scripts using `sandctl new` without a TTY continue to work (auto-detect skips console)
- Scripts can explicitly use `--no-console` to guarantee no console attempt
- The --timeout flag behavior is unchanged
