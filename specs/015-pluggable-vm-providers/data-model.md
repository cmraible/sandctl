# Data Model: Pluggable VM Providers

**Feature**: 015-pluggable-vm-providers
**Date**: 2026-01-25

## Entities

### Config (Extended)

**Location**: `~/.sandctl/config` (YAML, 0600 permissions)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| default_provider | string | Yes | Provider to use when --provider flag not specified |
| ssh_public_key | string | Yes | Path to SSH public key file (e.g., ~/.ssh/id_ed25519.pub) |
| opencode_zen_key | string | No | OpenCode API key (preserved from existing config) |
| providers | map[string]ProviderConfig | Yes | Provider-specific configurations |

**Example**:
```yaml
default_provider: hetzner
ssh_public_key: ~/.ssh/id_ed25519.pub
opencode_zen_key: "zen-key-here"

providers:
  hetzner:
    token: "hetzner-api-token"
    region: ash
    server_type: cpx31
    image: ubuntu-24.04
```

**Validation Rules**:
- default_provider must exist in providers map
- ssh_public_key path must exist and be readable
- At least one provider must be configured

---

### ProviderConfig (Hetzner)

**Location**: Nested under `providers.hetzner` in config

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| token | string | Yes | - | Hetzner Cloud API token |
| region | string | No | ash | Datacenter location (ash, hel1, fsn1, nbg1) |
| server_type | string | No | cpx31 | Server hardware type |
| image | string | No | ubuntu-24.04 | OS image name |
| ssh_key_id | int64 | No | - | Cached Hetzner SSH key ID (auto-populated) |

**Validation Rules**:
- token must be non-empty string
- region must be valid Hetzner location
- server_type must be valid Hetzner server type
- image must be valid Hetzner image name

---

### Session (Extended)

**Location**: `~/.sandctl/sessions.json` (JSON, 0600 permissions)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Human-readable session name (e.g., "bright-panda") |
| status | Status | Yes | Session status (provisioning, running, stopped, failed) |
| created_at | time.Time | Yes | Session creation timestamp |
| timeout | Duration | No | Auto-destroy timeout |
| provider | string | Yes | Provider name (e.g., "hetzner") |
| provider_id | string | Yes | Provider-specific VM identifier |
| ip_address | string | Yes | Public IPv4 address for SSH |

**Example**:
```json
{
  "sessions": [
    {
      "id": "bright-panda",
      "status": "running",
      "created_at": "2026-01-25T10:30:00Z",
      "timeout": "2h",
      "provider": "hetzner",
      "provider_id": "12345678",
      "ip_address": "65.108.123.45"
    }
  ]
}
```

**State Transitions**:
```
provisioning → running → stopped
     ↓            ↓         ↓
   failed      failed   (destroyed)
```

**Validation Rules**:
- id must be 2-15 lowercase letters
- provider must be non-empty
- provider_id must be non-empty when status is running
- ip_address must be valid IPv4 when status is running

---

### VM (Provider-Agnostic)

**Location**: In-memory only (returned by provider operations)

| Field | Type | Description |
|-------|------|-------------|
| ID | string | Provider-specific identifier |
| Name | string | VM name (matches session ID) |
| Status | VMStatus | Current VM status |
| IPAddress | string | Public IPv4 address |
| CreatedAt | time.Time | VM creation timestamp |
| Region | string | Datacenter region |
| ServerType | string | Hardware configuration |

**VMStatus Values**:
- `Provisioning` - VM is being created
- `Starting` - VM is booting
- `Running` - VM is ready for SSH
- `Stopping` - VM is shutting down
- `Stopped` - VM is powered off
- `Deleting` - VM is being deleted
- `Failed` - VM creation/operation failed

---

### CreateOpts (Provider-Agnostic)

**Location**: Passed to provider.Create()

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Name | string | Yes | Session name for the VM |
| SSHKeyID | string | Yes | Provider's SSH key identifier |
| Region | string | No | Override default region |
| ServerType | string | No | Override default server type |
| Image | string | No | Override default image |
| UserData | string | No | Cloud-init script content |

---

### HetznerSSHKey

**Location**: Managed in Hetzner Cloud API

| Field | Type | Description |
|-------|------|-------------|
| ID | int64 | Hetzner SSH key identifier |
| Name | string | Key name (format: sandctl-{fingerprint-prefix}) |
| Fingerprint | string | SSH key fingerprint |
| PublicKey | string | Full public key content |

**Lifecycle**:
1. On first `sandctl new`, read user's public key
2. Check Hetzner for existing key with same fingerprint
3. If not found, create new SSH key in Hetzner
4. Cache key ID in config for future use

## Relationships

```
Config
  ├── default_provider ──references──> ProviderConfig (by name)
  ├── ssh_public_key ──file path──> User's SSH public key
  └── providers
        └── hetzner: ProviderConfig
              └── ssh_key_id ──references──> HetznerSSHKey (in Hetzner API)

Session
  ├── provider ──identifies──> which Provider to use
  ├── provider_id ──references──> VM (in provider's API)
  └── ip_address ──used by──> sshexec for SSH connections

VM (transient)
  └── maps to ──> Session (by Name matching ID)
```

## Migration Notes

### From Sprites Config

Old format:
```yaml
sprites_token: "old-sprites-token"
opencode_zen_key: "zen-key"
```

New format:
```yaml
default_provider: hetzner
ssh_public_key: ~/.ssh/id_ed25519.pub
opencode_zen_key: "zen-key"

providers:
  hetzner:
    token: ""  # User must configure
```

**Migration Behavior**:
- Detect old config format (has `sprites_token`, no `providers`)
- Preserve `opencode_zen_key`
- Prompt user to run `sandctl init` to configure new provider
- Delete `sprites_token` (no longer used)

### Session Compatibility

Old sessions (without provider field) are invalid after upgrade:
- Display warning on `sandctl list`
- Remove orphaned sessions automatically
- User informed to destroy old sprites manually in Fly.io console
