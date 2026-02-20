# Engineer 5 — Provider System, Hetzner & New Command

**Stream**: E
**PRs**: PR-10, PR-13

## Ownership

You own the cloud provider abstraction and the VM provisioning workflow:

| Module | Files |
|--------|-------|
| Provider interface | `sandctl-ts/src/provider/interface.ts`, `sandctl-ts/src/provider/types.ts`, `sandctl-ts/src/provider/errors.ts`, `sandctl-ts/src/provider/registry.ts` |
| Hetzner client | `sandctl-ts/src/hetzner/client.ts` |
| Hetzner provider | `sandctl-ts/src/hetzner/provider.ts` |
| Hetzner SSH keys | `sandctl-ts/src/hetzner/ssh-keys.ts` |
| Hetzner setup | `sandctl-ts/src/hetzner/setup.ts` |
| New command | `sandctl-ts/src/commands/new.ts` |

---

## PR-10: Provider Interface + Hetzner Client (Tasks T030–T038)

**Blocked by**: PR-02 (config types)
**Blocks**: PR-06 (list/destroy need provider), PR-13 (new cmd)

### What to Build

#### 1. Provider Interface (`sandctl-ts/src/provider/interface.ts`)

```typescript
export interface Provider {
  name(): string;
  create(opts: CreateOpts): Promise<VM>;
  get(id: string): Promise<VM>;
  delete(id: string): Promise<void>;
  list(): Promise<VM[]>;
  waitReady(id: string, timeout: number): Promise<void>;
}

export interface SSHKeyManager {
  ensureSSHKey(name: string, publicKey: string): Promise<string>;
}
```

#### 2. Provider Types (`sandctl-ts/src/provider/types.ts`)

```typescript
export type VMStatus =
  | "provisioning" | "starting" | "running"
  | "stopping" | "stopped" | "deleting" | "failed";

export interface VM {
  id: string;
  name: string;
  status: VMStatus;
  ipAddress: string;
  region: string;
  serverType: string;
  createdAt: string;
}

export interface CreateOpts {
  name: string;
  region?: string;
  serverType?: string;
  image?: string;
  sshKeyIDs?: string[];
  userData?: string;  // Cloud-init script
}
```

#### 3. Provider Errors (`sandctl-ts/src/provider/errors.ts`)

```typescript
export class ErrNotFound extends Error { }
export class ErrAuthFailed extends Error { }
export class ErrQuotaExceeded extends Error { }
export class ErrProvisionFailed extends Error { }
export class ErrTimeout extends Error { }
```

#### 4. Provider Registry (`sandctl-ts/src/provider/registry.ts`)

```typescript
type ProviderFactory = (config: ProviderConfig) => Provider & SSHKeyManager;

export function register(name: string, factory: ProviderFactory): void;
export function get(name: string, config: ProviderConfig): Provider & SSHKeyManager;
export function available(): string[];
```

#### 5. Hetzner API Client (`sandctl-ts/src/hetzner/client.ts`)

Use `fetch` (Bun built-in) for direct REST API calls against `https://api.hetzner.cloud/v1`:

```typescript
export class HetznerClient {
  constructor(token: string);

  // Servers
  async createServer(opts: CreateServerOpts): Promise<HetznerServer>;
  async getServer(id: string): Promise<HetznerServer>;
  async deleteServer(id: string): Promise<void>;
  async listServers(labelSelector?: string): Promise<HetznerServer[]>;

  // SSH Keys
  async createSSHKey(name: string, publicKey: string): Promise<HetznerSSHKey>;
  async listSSHKeys(fingerprint?: string): Promise<HetznerSSHKey[]>;

  // Validation
  async listDatacenters(): Promise<void>;  // Used to validate token
}
```

All API calls:
- Set `Authorization: Bearer <token>` header
- Set `Content-Type: application/json`
- Handle HTTP error codes → throw appropriate provider errors
- 401 → `ErrAuthFailed`
- 404 → `ErrNotFound`
- 429/quota → `ErrQuotaExceeded`

#### 6. Hetzner Provider (`sandctl-ts/src/hetzner/provider.ts`)

Implement `Provider` and `SSHKeyManager` interfaces:

**`create(opts)`**:
- Defaults: region="ash", serverType="cpx31", image="ubuntu-24.04"
- Add cloud-init script as `user_data`
- Add label `managed-by: sandctl`
- Return VM with mapped status

**`waitReady(id, timeout)`**:
- Poll every 5 seconds
- Check: server status is "running" AND public IPv4 exists AND SSH connection succeeds (TCP probe on port 22, 5s timeout)
- Overall timeout default: 5 minutes for VM, 10 minutes for cloud-init

**`list()`**:
- Filter by label `managed-by=sandctl`

#### 7. SSH Key Management (`sandctl-ts/src/hetzner/ssh-keys.ts`)

**`ensureSSHKey(name, publicKey)`**:
- Calculate MD5 fingerprint of public key
- List existing keys, check for fingerprint match
- If match found, return existing key ID
- If not found, create new key
- Handle race conditions (key created between list and create → retry)

#### 8. Cloud-Init Script (`sandctl-ts/src/hetzner/setup.ts`)

Generate the cloud-init bash script. **Must produce identical VM setup as Go version**:

```bash
#!/bin/bash
set -euo pipefail

# Update packages
apt-get update && apt-get upgrade -y

# Install prerequisites
apt-get install -y curl git wget jq htop vim

# Install Docker
# ... (exact script from Go's internal/hetzner/setup.go)

# Create agent user
useradd -m -s /bin/bash -G sudo,docker agent
echo "agent ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/agent

# Copy SSH keys to agent user
mkdir -p /home/agent/.ssh
cp /root/.ssh/authorized_keys /home/agent/.ssh/
chown -R agent:agent /home/agent/.ssh
chmod 700 /home/agent/.ssh
chmod 600 /home/agent/.ssh/authorized_keys

# Install GitHub CLI
# ... (from official apt repo)

# Signal completion
touch /var/lib/cloud/instance/boot-finished
echo "cloud-init complete" >> /var/log/sandctl-init.log
```

#### 9. Auto-Registration

```typescript
// src/hetzner/provider.ts (at module level)
import { register } from "../provider/registry";
register("hetzner", (config) => new HetznerProvider(config));
```

Import this module in `sandctl-ts/src/index.ts` to ensure registration happens at startup.

### How to Verify

```bash
# Type check
bun run lint

# Test Hetzner API calls (requires token)
HETZNER_API_TOKEN=<token> bun -e "
import { HetznerClient } from './src/hetzner/client.ts';
const client = new HetznerClient(process.env.HETZNER_API_TOKEN!);
await client.listDatacenters();
console.log('Token validated successfully');
"

# Test provider registry
bun -e "
import './src/hetzner/provider.ts';  // triggers registration
import { available } from './src/provider/registry.ts';
console.log(available());  // ['hetzner']
"

# Test cloud-init script generation
bun -e "
import { generateCloudInit } from './src/hetzner/setup.ts';
console.log(generateCloudInit());
"
# Compare output with Go version's cloud-init script

# Test SSH key fingerprint calculation
bun -e "
import { calculateFingerprint } from './src/hetzner/ssh-keys.ts';
// Test with known public key
"
```

### Constitution Compliance

- **I. Code Quality**: Clean interface/implementation separation; single-purpose modules
- **I. Type Safety**: Provider interface enforces contract; VM statuses are union types
- **II. Performance**: `waitReady` polls efficiently (5s intervals, not busy-loop)
- **III. Security**: API token in Authorization header only; label-based filtering prevents acting on non-sandctl VMs
- **III. Input Validation**: API errors mapped to typed error classes
- **III. Secrets Management**: Token passed via constructor, never logged

---

## PR-13: New Command (Tasks T048–T054)

**Blocked by**: PR-02 (config), PR-03 (session), PR-04 (UI), PR-10 (provider), PR-11 (SSH)
**Blocks**: PR-16 (E2E)

This is the most complex command. It orchestrates all modules together.

### What to Build

#### 1. Main Flow (`sandctl-ts/src/commands/new.ts`)

`sandctl new` — Full provisioning workflow:

1. Load config, validate (check for legacy config)
2. Get provider from registry
3. Load template if `-T` flag provided
4. Parse timeout duration if `-t` provided
5. Generate human-readable session ID (avoid collisions with existing sessions)
6. Warn if git config not set (but don't block)
7. Run provisioning steps with progress spinners:

```typescript
const steps: ProgressStep[] = [
  { message: "Uploading SSH key", action: () => ensureSSHKey(...) },
  { message: "Provisioning VM", action: () => provider.create(...) },
  { message: "Waiting for VM to be ready", action: () => provider.waitReady(...) },
  { message: "Configuring OpenCode", action: () => setupOpenCode(...) },  // if configured
  { message: "Configuring git", action: () => setupGitConfig(...) },      // if configured
  { message: "Authenticating GitHub CLI", action: () => setupGitHub(...) },// if configured
  { message: "Running template script", action: () => runTemplate(...) }, // if template
];
await runSteps(steps);
```

8. Update session record: status → "running", set provider_id, ip_address
9. Print success: session name, IP address
10. Auto-connect console if interactive terminal and not `--no-console`

#### 2. Flags

```
-t, --timeout <duration>    Auto-destroy after duration (e.g., "1h", "30m")
--no-console                Skip automatic console connection
-T, --template <name>       Template to use for initialization
-p, --provider <name>       Provider (overrides config default)
--region <region>            Datacenter region (overrides config)
--server-type <type>         Server type (overrides config)
--image <image>              OS image (overrides config)
```

#### 3. Error Cleanup (Task T050)

If any step fails:
1. Attempt to delete VM from provider (if created)
2. Mark session as "failed" in store
3. Print error to stderr with recovery instructions:
   - "Session '<name>' failed during provisioning."
   - "The VM may still be running. Use 'sandctl destroy <name>' to clean up."

#### 4. Git Config Setup via SSH (Task T052)

```typescript
async function setupGitConfig(ssh: SSHClient, config: Config): Promise<void> {
  if (config.git_config_path) {
    // File mode: read local gitconfig, base64 encode, transfer via SSH
    const content = await readFile(expandTilde(config.git_config_path), "utf-8");
    const b64 = Buffer.from(content).toString("base64");
    await ssh.exec(`echo '${b64}' | base64 -d > /home/agent/.gitconfig`);
  } else if (config.git_user_name && config.git_user_email) {
    // Manual mode: generate minimal gitconfig
    const gitconfig = `[user]\n\tname = ${config.git_user_name}\n\temail = ${config.git_user_email}\n`;
    const b64 = Buffer.from(gitconfig).toString("base64");
    await ssh.exec(`echo '${b64}' | base64 -d > /home/agent/.gitconfig`);
  }
  // Set ownership
  await ssh.exec("chown agent:agent /home/agent/.gitconfig && chmod 644 /home/agent/.gitconfig");
}
```

#### 5. GitHub CLI Setup via SSH (Task T053)

```typescript
async function setupGitHub(ssh: SSHClient, token: string): Promise<void> {
  // Pass token via stdin (never as command argument — would appear in process list)
  await ssh.execWithStreams(
    "sudo -u agent gh auth login --with-token --hostname github.com",
    { stdin: token + "\n" }
  );
  await ssh.exec("sudo -u agent gh auth setup-git");
}
```

#### 6. Template Script Execution (Task T054)

```typescript
async function runTemplateScript(ssh: SSHClient, template: TemplateConfig, initScript: string): Promise<void> {
  const b64 = Buffer.from(initScript).toString("base64");
  const envVars = `SANDCTL_TEMPLATE_NAME='${template.original_name}' SANDCTL_TEMPLATE_NORMALIZED='${template.template}'`;
  await ssh.exec(`echo '${b64}' | base64 -d > /tmp/init.sh && chmod +x /tmp/init.sh && ${envVars} /tmp/init.sh`);
}
```

Template init script failures: log warning but **do not** abort session. The session remains running for debugging.

### How to Verify

```bash
# Full provisioning workflow (requires Hetzner token)
./sandctl init --hetzner-token <token> --ssh-public-key ~/.ssh/id_ed25519.pub
./sandctl new --no-console
# Should provision VM, show progress spinners, print session name + IP

# Verify session recorded
./sandctl list
# Should show new session with "running" status

# Verify SSH access works
./sandctl exec <session-name> -c "whoami"
# Should print "root" or "agent"

# Verify git config (if configured)
./sandctl exec <session-name> -c "sudo -u agent git config --global user.name"

# Verify GitHub CLI (if configured)
./sandctl exec <session-name> -c "sudo -u agent gh auth status"

# Test with template
./sandctl template add test-tmpl
# Edit init.sh to: echo "template ran" > /tmp/template-marker
./sandctl new -T test-tmpl --no-console
./sandctl exec <session-name> -c "cat /tmp/template-marker"
# Should print "template ran"

# Test timeout
./sandctl new -t 1h --no-console
./sandctl list
# Timeout column should show "~1h remaining"

# Error cleanup: interrupt during provisioning
# Ctrl+C during "Waiting for VM..." → session should be marked failed

# Clean up
./sandctl destroy <session-name> --force
```

### Constitution Compliance

- **I. Code Quality**: Complex workflow broken into named steps; each setup function is single-purpose
- **II. Performance**: `waitReady` has bounded timeout (5 min VM, 10 min cloud-init); no busy-waiting
- **III. Security**: GitHub token passed via SSH stdin, never as command argument; git config transferred via base64 (handles special characters safely)
- **III. Secrets Management**: Tokens never appear in logs, spinner messages, or error output
- **III. Defense in Depth**: Failed provisioning attempts cleanup (delete VM); session marked failed for recovery
- **V. E2E Testing**: The `new → list → exec → destroy` workflow is the core E2E test path
