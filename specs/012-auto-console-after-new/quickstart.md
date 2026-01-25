# Quickstart: sandctl new (Auto-Console)

This guide covers the updated `sandctl new` command which now automatically connects you to an interactive console after creating a session.

## Basic Usage

### Create and Connect (Default)

Simply run `new` to create a session and immediately start working:

```bash
sandctl new
```

This will:
1. Provision a new sandbox VM
2. Install development tools
3. Set up OpenCode
4. Automatically connect you to an interactive terminal

You'll see provisioning progress, then seamlessly transition to a shell prompt inside the sandbox.

### Exit and Reconnect

When you exit the console (Ctrl+D or `exit`), the sandbox keeps running:

```bash
# Reconnect to your session
sandctl console alice
```

### Destroy When Done

```bash
sandctl destroy alice
```

## Advanced Usage

### Skip Auto-Console

For scripts or when you just want to create without connecting:

```bash
# Create session, don't connect
sandctl new --no-console
```

### Create with Timeout

Set an auto-destroy timer to avoid forgotten sessions:

```bash
# Auto-destroy after 2 hours
sandctl new --timeout 2h

# Combine with --no-console for automation
sandctl new --timeout 1h --no-console
```

## In Scripts and CI

The command automatically detects non-interactive environments:

```bash
#!/bin/bash
# This automatically skips console (no TTY)
SESSION=$(sandctl new 2>&1 | grep "Session created:" | awk '{print $3}')

# Run commands
sandctl exec "$SESSION" -c "npm install"
sandctl exec "$SESSION" -c "npm test"

# Cleanup
sandctl destroy "$SESSION" --force
```

Or be explicit with `--no-console`:

```bash
#!/bin/bash
sandctl new --no-console --timeout 30m
```

## Troubleshooting

### Console Connection Failed

If provisioning succeeds but console connection fails:

```
Session created: alice
Error: Failed to connect to console: ...

Session was created successfully. Use 'sandctl console alice' to connect manually.
```

The session is ready—just use `sandctl console` to connect.

### "Console requires interactive terminal"

This appears when running without a TTY:

```
Error: console requires an interactive terminal

Use 'sandctl exec alice -c <command>' for non-interactive execution.
```

Use `--no-console` flag or `sandctl exec` for non-interactive use.

## Summary

| Scenario | Command |
|----------|---------|
| Create + connect | `sandctl new` |
| Create only | `sandctl new --no-console` |
| Create with timeout | `sandctl new --timeout 2h` |
| Reconnect | `sandctl console <name>` |
| Destroy | `sandctl destroy <name>` |
