# sandctl

A CLI tool for managing sandboxed AI web development agents.

sandctl provisions isolated VM environments using [Fly.io Sprites](https://sprites.dev) where AI coding agents (Claude, OpenCode, Codex) can work on development tasks safely.

## Requirements

- Go 1.22 or later
- A Sprites API token ([get one here](https://sprites.dev/tokens))
- An API key for your preferred AI agent

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/sandctl/sandctl.git
cd sandctl

# Download dependencies
make deps

# Build (output: build/sandctl)
make build

# Install to GOPATH/bin
make install

# Or install to /usr/local/bin
make install-local
```

### Build for All Platforms

```bash
make build-all
```

This creates binaries for:
- `build/sandctl-darwin-arm64` (macOS Apple Silicon)
- `build/sandctl-darwin-amd64` (macOS Intel)
- `build/sandctl-linux-amd64` (Linux x86_64)
- `build/sandctl-linux-arm64` (Linux ARM64)

## Quick Start

### 1. Initialize Configuration

Run the interactive setup:

```bash
sandctl init
```

This will prompt you for:
- **Sprites API token** - for VM provisioning
- **Default AI agent** - claude, opencode, or codex
- **API key** - for your selected agent

Configuration is saved to `~/.sandctl/config` with secure permissions (0600).

### 2. Start a Session

```bash
sandctl start --prompt "Create a React todo app"
```

### 3. List Active Sessions

```bash
sandctl list
```

### 4. Connect to a Session

```bash
sandctl exec <session-id>
```

### 5. Destroy a Session

```bash
sandctl destroy <session-id>
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize or update configuration |
| `start` | Provision a new sandboxed agent session |
| `list` | List active sessions |
| `exec` | Connect to a running session |
| `destroy` | Terminate and remove a session |
| `version` | Show version information |

## Configuration

### Interactive Setup

```bash
sandctl init
```

### Non-Interactive Setup (CI/Scripts)

```bash
sandctl init \
  --sprites-token YOUR_SPRITES_TOKEN \
  --agent claude \
  --api-key YOUR_ANTHROPIC_KEY
```

### Configuration File

Located at `~/.sandctl/config` (YAML format):

```yaml
sprites_token: "your-sprites-token"
default_agent: claude
agent_api_keys:
  claude: "your-anthropic-key"
  opencode: "your-opencode-key"
```

### Reconfiguring

Run `sandctl init` again to update settings. Press Enter to keep existing values, or type new ones to update.

## Usage Examples

### Start with Default Agent

```bash
sandctl start --prompt "Create a React todo app with TypeScript"
```

### Start with Specific Agent

```bash
sandctl start --prompt "Build a REST API in Go" --agent opencode
```

### Start with Auto-Destroy Timeout

```bash
sandctl start --prompt "Experiment with new feature" --timeout 2h
```

### Use a Different Config File

```bash
sandctl --config /path/to/config start --prompt "My task"
```

### Verbose Output

```bash
sandctl -v start --prompt "Debug something"
```

## Development

### Available Make Targets

```bash
make help    # Show all available targets
```

| Target | Description |
|--------|-------------|
| `make build` | Build the binary to `build/sandctl` |
| `make build-all` | Build for all platforms |
| `make test` | Run tests with race detection and coverage |
| `make test-unit` | Run unit tests only |
| `make lint` | Run linters (requires golangci-lint) |
| `make fmt` | Format code |
| `make install` | Install to `$GOPATH/bin` |
| `make install-local` | Install to `/usr/local/bin` |
| `make clean` | Remove build artifacts |
| `make deps` | Download and tidy dependencies |
| `make vuln` | Run vulnerability check |

### Run Tests

```bash
make test
```

### Build

```bash
make build
```

### Format Code

```bash
make fmt
```

### Clean Build Artifacts

```bash
make clean
```

## Project Structure

```
sandctl/
├── cmd/sandctl/          # CLI entry point
│   └── main.go
├── internal/
│   ├── cli/              # Command implementations
│   │   ├── root.go       # Root command and global flags
│   │   ├── init.go       # Init command
│   │   ├── start.go      # Start command
│   │   ├── list.go       # List command
│   │   ├── exec.go       # Exec command
│   │   └── destroy.go    # Destroy command
│   ├── config/           # Configuration handling
│   ├── session/          # Session management
│   ├── sprites/          # Sprites API client
│   └── ui/               # User interface helpers
└── specs/                # Feature specifications
```

## License

See [LICENSE](LICENSE) for details.
