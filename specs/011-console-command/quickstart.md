# Quickstart: Console Command

**Feature**: 011-console-command
**Date**: 2026-01-25

## Overview

The `sandctl console` command provides SSH-like interactive terminal access to your sandbox sessions. It's the simplest way to get a shell in your sandbox.

## Prerequisites

- sandctl installed and configured (`sandctl init` completed)
- A running session (create one with `sandctl new`)

## Basic Usage

### Connect to a Session

```bash
# List your sessions
sandctl list

# Connect to a session
sandctl console alice
```

### What to Expect

```
$ sandctl console alice
Connecting to alice...
Connected. Press Ctrl+D to exit.
user@sprite:~$
```

You now have a full interactive shell. Run any commands as you would via SSH.

### Exit the Session

- Press **Ctrl+D** to exit
- Or type `exit` and press Enter

The session remains running after you disconnect.

## Common Tasks

### Explore Files

```bash
sandctl console alice
# Now in the sandbox:
ls -la
cd /workspace
cat README.md
```

### Run Development Commands

```bash
sandctl console alice
# Now in the sandbox:
npm install
npm run dev
```

### Debug Issues

```bash
sandctl console alice
# Now in the sandbox:
ps aux
tail -f /var/log/app.log
```

## Console vs Exec

Use **console** when you want an interactive shell:
```bash
sandctl console alice
```

Use **exec** when you want to run a single command:
```bash
sandctl exec alice -c "npm test"
```

Use **exec** when piping input:
```bash
cat script.sh | sandctl exec alice -c "bash"
```

## Troubleshooting

### "console requires an interactive terminal"

You're trying to use console with piped input. Use `exec -c` instead:
```bash
# Won't work:
echo "ls" | sandctl console alice

# Use this instead:
sandctl exec alice -c "ls"
```

### "session not found"

The session doesn't exist or has a typo:
```bash
# Check available sessions
sandctl list

# Session names are case-insensitive
sandctl console Alice  # works if "alice" exists
```

### "session is not running"

The session has stopped or failed:
```bash
# Check session status
sandctl list

# Create a new session if needed
sandctl new
```

### Terminal looks corrupted after exit

This shouldn't happen, but if it does:
```bash
reset
```

## Tips

1. **Tab completion**: Works inside the console session
2. **Colors**: Full color support for commands like `ls --color`
3. **Resize**: Resize your terminal window—the remote shell adapts
4. **Ctrl+C**: Sends interrupt to the remote process, not sandctl
