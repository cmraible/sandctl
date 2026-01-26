# Research: Pluggable VM Providers

**Feature**: 015-pluggable-vm-providers
**Date**: 2026-01-25

## Decision 1: Hetzner Cloud Go SDK

**Decision**: Use official `github.com/hetznercloud/hcloud-go/v2/hcloud` SDK

**Rationale**:
- Official SDK maintained by Hetzner
- Built-in retry with exponential backoff (5 retries, max 60s)
- Full type safety with Go structs
- Handles authentication, rate limiting, and error responses
- Active maintenance with recent updates (Jan 2026)

**Alternatives Considered**:
- Raw HTTP API: More control but requires implementing auth, retry, error handling
- Third-party SDKs: Less maintained, potential compatibility issues

## Decision 2: SSH Client Library

**Decision**: Use `golang.org/x/crypto/ssh` for SSH operations

**Rationale**:
- Standard Go library for SSH
- Well-maintained as part of golang.org/x
- Supports interactive terminals, command execution, and key authentication
- Already used widely in Go ecosystem (e.g., by Terraform, Docker Machine)

**Alternatives Considered**:
- System SSH binary: Requires SSH installed, less portable, harder to test
- gliderlabs/ssh: Server-focused, not client library

## Decision 3: Provider Interface Design

**Decision**: Define minimal interface with 6 core methods

```go
type Provider interface {
    Name() string
    Create(ctx context.Context, opts CreateOpts) (*VM, error)
    Get(ctx context.Context, id string) (*VM, error)
    Delete(ctx context.Context, id string) error
    List(ctx context.Context) ([]*VM, error)
    WaitReady(ctx context.Context, id string, timeout time.Duration) error
}
```

**Rationale**:
- Minimal surface area: only operations needed by CLI commands
- SSH execution handled separately (sshexec package) since it's provider-agnostic
- WaitReady abstracts polling logic specific to each provider
- Context support for cancellation and timeouts

**Alternatives Considered**:
- Including Exec/Console in interface: Rejected because SSH is universal
- Single Create method with complex options: Kept simple, provider-specific options in CreateOpts

## Decision 4: Configuration Structure

**Decision**: Nested provider configuration in YAML

```yaml
default_provider: hetzner
ssh_public_key: ~/.ssh/id_ed25519.pub

providers:
  hetzner:
    token: "your-hetzner-api-token"
    region: ash
    server_type: cpx31
    image: ubuntu-24.04
```

**Rationale**:
- Clear separation between global and provider-specific settings
- Easy to add new providers without restructuring
- Default provider at top level for quick access
- Backward-compatible structure (old config can be detected and migrated)

**Alternatives Considered**:
- Flat structure: Would become cluttered with multiple providers
- Separate config files per provider: Adds complexity, harder to manage

## Decision 5: Session Storage Extension

**Decision**: Add provider metadata to existing session structure

```go
type Session struct {
    ID        string    `json:"id"`
    Status    Status    `json:"status"`
    CreatedAt time.Time `json:"created_at"`
    Timeout   *Duration `json:"timeout,omitempty"`
    // New fields
    Provider   string `json:"provider"`
    ProviderID string `json:"provider_id"`  // Hetzner server ID, etc.
    IPAddress  string `json:"ip_address"`
}
```

**Rationale**:
- Minimal changes to existing structure
- Provider field enables routing to correct provider for operations
- ProviderID stores provider-specific identifier for API calls
- IPAddress cached to avoid API calls for SSH connection

**Alternatives Considered**:
- Separate provider metadata file: Adds complexity, sync issues
- Storing full VM object: Too much duplication, stale data risk

## Decision 6: VM Setup Script Approach

**Decision**: Cloud-init user-data script for initial setup

**Rationale**:
- Runs during VM boot, no SSH connection needed initially
- Hetzner supports user-data parameter in server creation
- Can install Docker, dev tools, and configure system before SSH ready
- Standard approach across cloud providers

**Script Contents**:
```bash
#!/bin/bash
apt-get update
apt-get install -y docker.io git nodejs npm python3 python3-pip
systemctl enable docker
systemctl start docker
usermod -aG docker root
```

**Alternatives Considered**:
- SSH-based setup after boot: Slower, requires waiting for SSH
- Pre-built images: Requires image maintenance, less flexible

## Decision 7: SSH Key Management

**Decision**: Upload user's existing public key to Hetzner on first use

**Flow**:
1. Read SSH public key from path in config
2. Check if key already exists in Hetzner (by fingerprint)
3. If not, create SSH key resource in Hetzner with name `sandctl-{hash}`
4. Store Hetzner SSH key ID in config for reuse
5. Reference key ID during server creation

**Rationale**:
- Avoids creating duplicate keys in Hetzner
- User controls their SSH key (can use same key for other purposes)
- Fingerprint-based matching handles key updates

**Alternatives Considered**:
- Generate new key per session: Harder to manage, user can't use existing key
- Always create new Hetzner key: Would accumulate duplicate keys

## Decision 8: Provider Registry Pattern

**Decision**: Simple map-based registry with init-time registration

```go
var providers = map[string]func(cfg *config.Config) (Provider, error){
    "hetzner": NewHetznerProvider,
}

func Get(name string, cfg *config.Config) (Provider, error) {
    factory, ok := providers[name]
    if !ok {
        return nil, fmt.Errorf("unknown provider: %s", name)
    }
    return factory(cfg)
}
```

**Rationale**:
- Simple and explicit
- No magic registration or reflection
- Easy to add new providers
- Factory function allows provider-specific initialization

**Alternatives Considered**:
- Interface-based plugin system: Over-engineered for 2-3 providers
- Global singleton: Harder to test, less flexible

## Decision 9: List Command Sync Behavior

**Decision**: Always sync with provider API on `sandctl list`

**Flow**:
1. Load local sessions
2. For each unique provider in sessions, call provider.List()
3. Reconcile: update status, remove sessions where VM doesn't exist
4. Add sessions for VMs not in local store (orphaned recovery)
5. Save updated sessions
6. Display results

**Rationale**:
- User always sees accurate state
- Catches externally deleted VMs
- Recovers from sandctl data loss
- Simple mental model: "list" shows what actually exists

**Alternatives Considered**:
- Separate --sync flag: Users would forget, stale data common
- Background sync: Complex, race conditions, battery drain

## Decision 10: Error Handling Strategy

**Decision**: Wrap provider errors with context, define common error types

```go
var (
    ErrNotFound       = errors.New("vm not found")
    ErrAuthFailed     = errors.New("authentication failed")
    ErrQuotaExceeded  = errors.New("quota exceeded")
    ErrProvisionFailed = errors.New("provisioning failed")
)
```

**Rationale**:
- CLI can handle errors uniformly regardless of provider
- Error wrapping preserves original error for debugging
- Common errors enable consistent user messages

**Alternatives Considered**:
- Pass through provider errors: Inconsistent UX across providers
- Error codes: Less idiomatic in Go
