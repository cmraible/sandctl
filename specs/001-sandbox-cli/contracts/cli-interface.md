# CLI Interface Contract: sandctl

**Feature**: 001-sandbox-cli
**Date**: 2026-01-22

## Global Options

```
sandctl [global-options] <command> [command-options]

Global Options:
  --config string    Config file path (default: ~/.sandctl/config)
  --verbose, -v      Enable verbose output
  --help, -h         Show help
  --version          Show version
```

## Commands

### sandctl start

Provision a new sandboxed VM and start an AI agent with the given prompt.

```
sandctl start [options]

Options:
  --prompt, -p string    Task prompt for the agent (required)
  --agent, -a string     Agent type: claude, opencode, codex (default: claude)
  --timeout, -t duration Auto-destroy after duration (e.g., 1h, 30m) (default: none)

Examples:
  sandctl start --prompt "Create a React todo app"
  sandctl start -p "Build a REST API" -a opencode
  sandctl start -p "Fix the login bug" --timeout 2h
```

**Output (success)**:
```
Starting session with claude agent...
✓ Provisioning VM...
✓ Installing development tools...
✓ Starting agent...

Session started: sandctl-a1b2c3d4
Agent: claude
Prompt: Create a React todo app

Use 'sandctl exec sandctl-a1b2c3d4' to connect.
Use 'sandctl destroy sandctl-a1b2c3d4' when done.
```

**Output (error)**:
```
Error: failed to provision VM: quota exceeded

Your Fly.io account has reached its sprite limit.
Visit https://fly.io/dashboard to upgrade or destroy unused sprites.
```

**Exit Codes**:
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error (missing token, invalid config) |
| 3 | API error (network, auth, quota) |

---

### sandctl list

Display all active sandctl sessions.

```
sandctl list [options]

Options:
  --format, -f string    Output format: table, json (default: table)
  --all, -a              Include stopped/failed sessions

Examples:
  sandctl list
  sandctl list --format json
  sandctl list --all
```

**Output (table format)**:
```
ID                 AGENT     STATUS      CREATED              TIMEOUT
sandctl-a1b2c3d4   claude    running     2026-01-22 10:30:00  -
sandctl-e5f6g7h8   opencode  running     2026-01-22 11:15:00  1h remaining
```

**Output (json format)**:
```json
[
  {
    "id": "sandctl-a1b2c3d4",
    "agent": "claude",
    "status": "running",
    "created_at": "2026-01-22T10:30:00Z",
    "timeout": null
  }
]
```

**Output (no sessions)**:
```
No active sessions.

Use 'sandctl start --prompt "your task"' to create one.
```

**Exit Codes**:
| Code | Meaning |
|------|---------|
| 0 | Success (including empty list) |
| 1 | General error |
| 3 | API error |

---

### sandctl exec

Open an interactive shell session inside a running VM.

```
sandctl exec <session-id> [options]

Arguments:
  session-id    The session ID to connect to (required)

Options:
  --command, -c string    Run a single command instead of interactive shell

Examples:
  sandctl exec sandctl-a1b2c3d4
  sandctl exec sandctl-a1b2c3d4 -c "ls -la"
  sandctl exec sandctl-a1b2c3d4 -c "cat /workspace/app.py"
```

**Output (interactive)**:
```
Connecting to sandctl-a1b2c3d4...
Connected. Press Ctrl+D to exit.

root@sprite:~#
```

**Output (command mode)**:
```
total 24
drwxr-xr-x 4 root root 4096 Jan 22 10:31 .
drwxr-xr-x 1 root root 4096 Jan 22 10:30 ..
-rw-r--r-- 1 root root  512 Jan 22 10:31 app.py
```

**Output (error - not found)**:
```
Error: session 'sandctl-invalid' not found

Use 'sandctl list' to see active sessions.
```

**Output (error - not running)**:
```
Error: session 'sandctl-a1b2c3d4' is not running (status: stopped)

Cannot connect to stopped sessions.
```

**Exit Codes**:
| Code | Meaning |
|------|---------|
| 0 | Success (clean exit from shell) |
| 1 | General error |
| 4 | Session not found |
| 5 | Session not in running state |
| * | Exit code from executed command (when using -c) |

---

### sandctl destroy

Terminate and remove a sandboxed VM.

```
sandctl destroy <session-id> [options]

Arguments:
  session-id    The session ID to destroy (required)

Options:
  --force, -f    Skip confirmation prompt

Examples:
  sandctl destroy sandctl-a1b2c3d4
  sandctl destroy sandctl-a1b2c3d4 --force
```

**Output (with confirmation)**:
```
Destroy session sandctl-a1b2c3d4? This cannot be undone. [y/N]: y
Destroying session...
✓ Session sandctl-a1b2c3d4 destroyed.
```

**Output (with --force)**:
```
Destroying session...
✓ Session sandctl-a1b2c3d4 destroyed.
```

**Output (error - not found)**:
```
Error: session 'sandctl-invalid' not found

Use 'sandctl list' to see active sessions.
```

**Exit Codes**:
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 3 | API error |
| 4 | Session not found |

---

## Configuration

### Config File Format

Location: `~/.sandctl/config` (YAML)

```yaml
# Fly.io Sprites API token (required)
sprites_token: "sprites_xxx..."

# Default agent when --agent not specified (optional, default: claude)
default_agent: claude

# API keys for each agent (required for agents you want to use)
agent_api_keys:
  claude: "sk-ant-api03-xxx..."      # ANTHROPIC_API_KEY
  opencode: "sk-ant-api03-xxx..."    # Uses Anthropic API
  codex: "sk-xxx..."                 # OPENAI_API_KEY
```

### Environment Variables

Environment variables override config file values:

| Variable | Overrides |
|----------|-----------|
| SANDCTL_CONFIG | Config file path |
| SPRITES_TOKEN | sprites_token |
| ANTHROPIC_API_KEY | agent_api_keys.claude, agent_api_keys.opencode |
| OPENAI_API_KEY | agent_api_keys.codex |

### First-Run Setup

If config file doesn't exist, `sandctl start` displays:

```
Configuration required.

Create ~/.sandctl/config with your Sprites token:

  sprites_token: "your-token-here"
  agent_api_keys:
    claude: "your-anthropic-key"

Get your Sprites token at: https://sprites.dev/tokens
Get your Anthropic key at: https://console.anthropic.com/
```
