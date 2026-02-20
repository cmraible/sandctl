# Data Model: Rewrite sandctl in TypeScript with Bun

**Feature**: 020-typescript-rewrite
**Date**: 2026-02-20

## Entity Definitions

These TypeScript types mirror the existing Go structs to maintain backward compatibility with existing config and session files.

### Config (YAML: `~/.sandctl/config`)

```typescript
interface Config {
  default_provider?: string;                // e.g., "hetzner"
  ssh_key_source?: "file" | "agent";        // SSH key mode
  ssh_public_key?: string;                  // Path to SSH public key file
  ssh_public_key_inline?: string;           // Inline public key (agent mode)
  ssh_key_fingerprint?: string;             // Fingerprint when using agent with multiple keys
  providers?: Record<string, ProviderConfig>;
  sprites_token?: string;                   // Legacy field (migration support)
  opencode_zen_key?: string;                // OpenCode Zen API key
  git_config_path?: string;                 // Path to local ~/.gitconfig
  git_user_name?: string;                   // Git user.name
  git_user_email?: string;                  // Git user.email
  github_token?: string;                    // GitHub personal access token
}

interface ProviderConfig {
  token: string;                            // API token (e.g., Hetzner)
  region?: string;                          // Default region (e.g., "ash")
  server_type?: string;                     // Default server type (e.g., "cpx31")
  image?: string;                           // Default OS image (e.g., "ubuntu-24.04")
  ssh_key_id?: number;                      // Provider-side SSH key ID (cached, int64 in Go)
}
```

**File permissions**: 0600 (read/write owner only)
**Directory permissions**: 0700

### Session (JSON: `~/.sandctl/sessions.json`)

```typescript
interface Session {
  id: string;                               // Human-readable name (e.g., "alice")
  status: Status;                           // Current session state
  provider: string;                         // Provider name (e.g., "hetzner")
  provider_id: string;                      // Provider-specific VM identifier
  ip_address: string;                       // Public IPv4 address
  region?: string;                          // Datacenter region
  server_type?: string;                     // Server hardware type
  created_at: string;                       // ISO 8601 timestamp
  timeout?: string;                         // Duration string (e.g., "1h", "30m")
}

type Status = "provisioning" | "running" | "stopped" | "failed";
```

### Template (`~/.sandctl/templates/<normalized-name>/config.yaml`)

```typescript
interface TemplateConfig {
  template: string;                         // Normalized name (e.g., "my-api")
  original_name: string;                    // Original name (e.g., "My API")
  created_at: string;                       // ISO 8601 timestamp
  timeout?: string;                         // Default timeout duration
}
```

**Directory structure per template**:
```
~/.sandctl/templates/<normalized-name>/
├── config.yaml      # Template metadata
└── init.sh          # Initialization script (executable, 0755)
```

**Name normalization**: "My API Template" → "my-api-template" (lowercase, spaces to hyphens)

### Provider Interface

```typescript
interface Provider {
  name(): string;
  create(opts: CreateOpts): Promise<VM>;
  get(id: string): Promise<VM>;
  delete(id: string): Promise<void>;
  list(): Promise<VM[]>;
  waitReady(id: string, timeout: number): Promise<void>;
}

interface SSHKeyManager {
  ensureSSHKey(name: string, publicKey: string): Promise<string>; // returns key ID
}

interface CreateOpts {
  name: string;
  region?: string;
  serverType?: string;
  image?: string;
  sshKeyIDs?: string[];
  userData?: string;                        // Cloud-init script
}

interface VM {
  id: string;                               // Provider-specific ID
  name: string;
  status: VMStatus;
  ipAddress: string;
  region: string;
  serverType: string;
  createdAt: string;                        // ISO 8601
}

type VMStatus =
  | "provisioning"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "deleting"
  | "failed";
```

### SSH Client

```typescript
interface SSHClientOptions {
  host: string;
  port?: number;                            // Default: 22
  username?: string;                        // Default: "root"
  privateKeyPath?: string;                  // Path to private key file
  useAgent?: boolean;                       // Use SSH agent
  agentSocket?: string;                     // Custom agent socket path
  timeout?: number;                         // Connection timeout in ms
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ConsoleOptions {
  term?: string;                            // Terminal type (default: xterm-256color)
  cols?: number;                            // Terminal columns
  rows?: number;                            // Terminal rows
}
```

### SSH Agent

```typescript
interface AgentKey {
  type: string;                             // Key type (e.g., "ssh-ed25519")
  fingerprint: string;                      // SHA256 fingerprint
  comment: string;                          // Key comment
  publicKey: Buffer;                        // Raw public key data
}
```

### UI Types

```typescript
// Exit codes
const ExitSuccess = 0;
const ExitConfigError = 2;
const ExitAPIError = 3;
const ExitSessionNotFound = 4;
const ExitSessionNotReady = 5;

interface ProgressStep {
  action: () => Promise<void>;
  message: string;
}
```

### Human-Readable Name Pool

The name pool consists of exactly 250 lowercase names (2-15 characters each), copied directly from the Go source to maintain session ID compatibility:

```typescript
const names: string[] = [
  "adam", "alex", "alice", /* ... 247 more names ... */ "zachary", "zoe"
];
```

The complete list must be ported exactly from `internal/session/names.go` to ensure existing session names remain valid.

## Serialization Notes

### YAML Config Compatibility

The TypeScript `yaml` library must produce output that matches Go's `gopkg.in/yaml.v3`:
- Use `snake_case` field names (matching Go struct tags)
- Omit `undefined`/`null` fields (matching Go's `omitempty`)
- Use plain scalar style for simple strings
- No document markers (`---`) at the start

### JSON Session Compatibility

The session store JSON must use the exact same field names as the Go version:
- `snake_case` keys (Go uses `json:"field_name"` tags)
- ISO 8601 timestamps (Go's `time.Time` marshals to RFC3339)
- Duration stored as string (e.g., `"1h0m0s"` or `"30m0s"`)
