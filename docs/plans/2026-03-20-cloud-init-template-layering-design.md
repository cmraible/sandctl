# Cloud-Init Template Layering Design

## Problem

The cloud-init configuration is hardcoded into sandctl as a single monolithic YAML file. Users cannot customize what gets installed on their VMs without modifying the source. The existing template system only runs bash scripts after cloud-init completes, which means templates cannot influence the cloud-init phase (packages, users, services, etc.).

## Design

### Three-Layer Architecture

VM user_data is assembled from up to three layers, each optional except the global base:

1. **Global base** (hardcoded in sandctl) — Creates the `agent` user with sudo access and copies SSH authorized_keys from root. Nothing else.
2. **User base template** (`~/.sandctl/templates/base/init`, optional) — Personal defaults applied to every VM. Users add packages, runcmd entries, or bash scripts here.
3. **Named template** (via `-T flag`, optional) — Project-specific configuration layered on top.

### Global Base Cloud-Config

```yaml
#cloud-config
users:
  - name: agent
    shell: /bin/bash
    groups:
      - sudo
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    ssh_authorized_keys: []

runcmd:
  - |
    mkdir -p /home/agent/.ssh
    if [ -f /root/.ssh/authorized_keys ]; then
      cp /root/.ssh/authorized_keys /home/agent/.ssh/authorized_keys
    else
      touch /home/agent/.ssh/authorized_keys
    fi
    chown -R agent:agent /home/agent/.ssh
    chmod 700 /home/agent/.ssh
    chmod 600 /home/agent/.ssh/authorized_keys
```

### Template Format

Templates are stored in `~/.sandctl/templates/<name>/` with the structure:

```
~/.sandctl/templates/<name>/
├── config.yaml    # metadata (unchanged)
└── init           # cloud-config YAML or bash script (format-agnostic, no extension)
```

The `init` file can be either format:
- **Cloud-config YAML** — detected by `#cloud-config` first line, sent as `text/cloud-config`
- **Bash script** — detected by shebang or default, sent as `text/x-shellscript`

Legacy `init.sh` files continue to work. The template store checks for `init` first, then falls back to `init.sh`.

### MIME Multipart Assembly

When multiple layers are present, they are combined into a MIME multipart message:

```
Content-Type: multipart/mixed; boundary="==SANDCTL=="
MIME-Version: 1.0

--==SANDCTL==
Content-Type: text/cloud-config
<global base>

--==SANDCTL==
Content-Type: text/cloud-config (or text/x-shellscript)
<user base template>

--==SANDCTL==
Content-Type: text/cloud-config (or text/x-shellscript)
<named template>

--==SANDCTL==--
```

When only the global base is needed (no templates), the plain `#cloud-config` string is sent directly without MIME wrapping.

### Snapshot Hashing

`snapshotVersion()` hashes the final assembled user_data string. This means:
- Any change to any layer invalidates the snapshot
- Different named templates produce different snapshots
- A user alternating between `-T web` and `-T ml` maintains separate cached snapshots

### `-T base` Handling

Passing `-T base` is an error: "the 'base' template is applied automatically. Use `sandctl template edit base` to modify it."

### Template Execution Change

Templates no longer run as bash scripts over SSH after cloud-init. They are part of cloud-init itself. The `runTemplateScript()` post-SSH code path is removed.

## Files Changed

- `src/hetzner/setup.ts` — Minimal base, content type detection, MIME multipart assembly
- `src/template/store.ts` — Read `init` (falling back to `init.sh`), create `init` for new templates
- `src/commands/new.ts` — Load and assemble layers, remove post-SSH template execution, error on `-T base`
- `src/hetzner/snapshots.ts` — Hash final assembled user_data
- `src/hetzner/provider.ts` — Accept assembled user_data instead of calling `generateCloudInit()` internally
- `tests/unit/hetzner/setup.test.ts` — Update for minimal base, add MIME assembly tests
- `tests/unit/commands/new.test.ts` — Remove template script tests, add layering tests
