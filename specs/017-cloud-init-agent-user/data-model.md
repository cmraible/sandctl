# Data Model: Cloud-Init Agent User

**Feature Branch**: `017-cloud-init-agent-user`
**Date**: 2026-01-26

## Overview

This feature has minimal data model impact. No new entities, types, or storage structures are required. The changes are primarily configuration and script modifications.

## Existing Entities (No Changes)

### Session (in sessions.json)
- No changes required
- Sessions continue to store VM connection info (IP, name)
- SSH user is determined at connection time from `sshexec.Client` defaults

### Config (in ~/.sandctl/config)
- No changes required
- SSH key path configuration unchanged
- Provider settings unchanged

## Constants Modified

### sshexec.defaultSSHUser
**File**: `internal/sshexec/client.go`

| Property | Current Value | New Value |
|----------|---------------|-----------|
| defaultSSHUser | "root" | "agent" |

**Impact**: All SSH connections will default to "agent" user. The `WithUser()` option remains available for explicit override if needed.

### repo.Spec.TargetPath()
**File**: `internal/repo/parser.go`

| Method | Current Return | New Return |
|--------|----------------|------------|
| TargetPath() | "/root/" + r.Name | "/home/agent/" + r.Name |

**Impact**: Repositories cloned via `--repo` flag will be placed in agent's home directory.

## Cloud-Init Script Structure

The cloud-init script is generated dynamically (not stored). The new structure:

```
┌─────────────────────────────────────────┐
│ Cloud-Init Script (user-data)           │
├─────────────────────────────────────────┤
│ 1. apt-get update                       │
│ 2. Install Docker                       │
│ 3. Install tools (7 packages)           │
│ 4. Create agent user                    │
│ 5. Add agent to docker group            │
│ 6. Setup SSH authorized_keys            │
│ 7. Configure passwordless sudo          │
│ 8. Cleanup                              │
│ 9. Signal completion                    │
├─────────────────────────────────────────┤
│ [Optional: Repository Clone Section]    │
│ - git clone to /home/agent/<repo>       │
│ - chown to agent:agent                  │
└─────────────────────────────────────────┘
```

## Validation Rules

No new validation rules required. Existing validations remain:
- Repository URL validation (in `repo.Parse()`)
- SSH key path validation (in config loading)
- Session name validation (in session management)

## State Transitions

No state machines or transitions. VM provisioning is a one-shot operation:

```
VM Created → Cloud-Init Runs → SSH Ready (as agent user)
```

## Relationships

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   sandctl    │────▶│  Hetzner VM  │────▶│ agent user   │
│   (client)   │     │  (cloud-init)│     │ (on VM)      │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │                    ▼                    │
       │              ┌──────────────┐          │
       │              │ SSH Keys     │◀─────────┘
       │              │ (copied from │
       │              │  root user)  │
       │              └──────────────┘
       │
       ▼
┌──────────────┐
│  Repository  │ (optional, cloned to /home/agent/)
└──────────────┘
```

## Migration

No data migration required. This change affects:
- **New VMs only**: Existing VMs continue with root user
- **No stored data changes**: sessions.json format unchanged
- **Backward compatibility**: Existing sessions with root user will continue to work (SSH still uses stored session info, but new connections default to agent)

Note: Users with existing VMs may need to manually connect as root (`ssh root@<ip>`) or recreate VMs to get the agent user configuration.
