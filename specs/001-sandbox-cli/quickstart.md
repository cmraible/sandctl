# Quickstart: sandctl

Get up and running with sandctl in 5 minutes.

## Prerequisites

- Go 1.22+ (for building from source) or download pre-built binary
- Fly.io account with Sprites access ([sprites.dev](https://sprites.dev))
- Anthropic API key (for Claude agent) or OpenAI API key (for Codex)

## Installation

### From Source

```bash
git clone https://github.com/your-org/sandctl.git
cd sandctl
go build -o sandctl ./cmd/sandctl
mv sandctl /usr/local/bin/
```

### Pre-built Binary

```bash
# macOS (Apple Silicon)
curl -L https://github.com/your-org/sandctl/releases/latest/download/sandctl-darwin-arm64 -o sandctl
chmod +x sandctl
mv sandctl /usr/local/bin/

# Linux (amd64)
curl -L https://github.com/your-org/sandctl/releases/latest/download/sandctl-linux-amd64 -o sandctl
chmod +x sandctl
mv sandctl /usr/local/bin/
```

## Configuration

Create `~/.sandctl/config`:

```yaml
sprites_token: "sprites_your_token_here"
default_agent: claude
agent_api_keys:
  claude: "sk-ant-api03-your_key_here"
```

**Get your tokens:**
- Sprites token: [sprites.dev/tokens](https://sprites.dev/tokens)
- Anthropic API key: [console.anthropic.com](https://console.anthropic.com/)

**Set secure permissions:**

```bash
chmod 600 ~/.sandctl/config
```

## Basic Usage

### 1. Start an Agent Session

```bash
# Start Claude with a task
sandctl start --prompt "Create a simple Express.js REST API with user CRUD operations"
```

Output:
```
Starting session with claude agent...
✓ Provisioning VM...
✓ Installing development tools...
✓ Starting agent...

Session started: sandctl-a1b2c3d4
Agent: claude
Prompt: Create a simple Express.js REST API with user CRUD operations

Use 'sandctl exec sandctl-a1b2c3d4' to connect.
Use 'sandctl destroy sandctl-a1b2c3d4' when done.
```

### 2. List Active Sessions

```bash
sandctl list
```

Output:
```
ID                 AGENT     STATUS      CREATED              TIMEOUT
sandctl-a1b2c3d4   claude    running     2026-01-22 10:30:00  -
```

### 3. Connect to a Session

```bash
# Interactive shell
sandctl exec sandctl-a1b2c3d4

# Or run a single command
sandctl exec sandctl-a1b2c3d4 -c "ls -la /workspace"
```

### 4. Destroy When Done

```bash
sandctl destroy sandctl-a1b2c3d4
```

## Example Workflows

### Web App Development

```bash
# Start agent with git repo context
sandctl start --prompt "Clone https://github.com/user/myapp and add authentication using Passport.js. Push changes to a new branch called 'feat/auth'."

# Check progress
sandctl exec sandctl-a1b2c3d4 -c "git log --oneline -5"

# Clean up
sandctl destroy sandctl-a1b2c3d4 --force
```

### Using Different Agents

```bash
# Use OpenCode instead of Claude
sandctl start --agent opencode --prompt "Build a CLI tool that converts CSV to JSON"

# Use Codex
sandctl start --agent codex --prompt "Create a Python script to analyze log files"
```

### Auto-Timeout for Cost Control

```bash
# Auto-destroy after 1 hour
sandctl start --prompt "Experiment with React Server Components" --timeout 1h
```

## Troubleshooting

### "Configuration required" Error

Create `~/.sandctl/config` with your tokens. See Configuration section above.

### "Quota exceeded" Error

You've hit your Fly.io sprite limit. Destroy unused sessions:

```bash
sandctl list
sandctl destroy <old-session-id> --force
```

### "Connection refused" on exec

The sprite may still be provisioning. Wait a moment and try again:

```bash
sandctl list  # Check status
sandctl exec <session-id>
```

### Agent Not Responding

Connect and check the agent process:

```bash
sandctl exec <session-id> -c "ps aux | grep claude"
```

## Next Steps

- Read the full [CLI Reference](contracts/cli-interface.md)
- Review the [Data Model](data-model.md)
- Check [Research Notes](research.md) for technical decisions
