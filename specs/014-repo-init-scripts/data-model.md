# Data Model: Repository Initialization Scripts

**Feature**: 014-repo-init-scripts
**Date**: 2026-01-25

## Entities

### RepoConfig

Represents a user's initialization configuration for a GitHub repository.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo` | string | Yes | Normalized repository identifier (lowercase, `owner-repo` format) |
| `original_name` | string | Yes | Original repository name as entered by user (preserves casing) |
| `created_at` | time.Time | Yes | When the configuration was created |
| `timeout` | time.Duration | No | Custom timeout for init script (default: 10 minutes) |

**Storage location**: `~/.sandctl/repos/<repo>/config.yaml`
**Permissions**: 0600 (read/write owner only)

**Example** (`~/.sandctl/repos/tryghost-ghost/config.yaml`):
```yaml
repo: tryghost-ghost
original_name: TryGhost/Ghost
created_at: 2026-01-25T10:30:00Z
timeout: 15m
```

### Init Script

Shell script file stored alongside the configuration.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| content | file | Yes | Bash script content |

**Storage location**: `~/.sandctl/repos/<repo>/init.sh`
**Permissions**: 0755 (executable by owner, readable by all)

**Template** (created by `sandctl repo add`):
```bash
#!/bin/bash
# Init script for {original_name}
# This script runs in the sprite after the repository is cloned.
# Working directory: /home/sprite/{repo-name}
#
# Common tasks:
# - Install dependencies: npm install, yarn, pip install -r requirements.txt
# - Install system packages: sudo apt-get install -y <package>
# - Set up environment: export VAR=value
# - Build the project: make, cargo build, etc.
#
# The script output is displayed during 'sandctl new -R {original_name}'
# Exit code 0 = success, non-zero = failure (console won't start automatically)

set -e  # Exit on first error

# Add your initialization commands below:

```

## Directory Structure

```
~/.sandctl/
├── config                    # Existing: main sandctl config (YAML)
├── sessions.json             # Existing: session store
└── repos/                    # NEW: repository configurations
    ├── tryghost-ghost/       # Normalized name as directory
    │   ├── config.yaml       # Metadata (original name, timeout)
    │   └── init.sh           # User-edited init script
    ├── facebook-react/
    │   ├── config.yaml
    │   └── init.sh
    └── ... (more repos)
```

**Directory permissions**:
- `~/.sandctl/` - 0700 (existing)
- `~/.sandctl/repos/` - 0700 (new)
- `~/.sandctl/repos/<repo>/` - 0700 (per-repo)

## Operations

### Create (sandctl repo add)

1. Prompt for repository name/URL
2. Parse and validate repository specification
3. Normalize name: `TryGhost/Ghost` → `tryghost-ghost`
4. Check if config already exists → error if so
5. Create directory: `~/.sandctl/repos/tryghost-ghost/` (0700)
6. Write `config.yaml` with metadata (0600)
7. Write `init.sh` template (0755)
8. Print path to init.sh for user reference

### Read (sandctl repo show)

1. Parse repository argument
2. Normalize name for lookup
3. Read and display `init.sh` content
4. (Optionally) show metadata from `config.yaml`

### List (sandctl repo list)

1. Read `~/.sandctl/repos/` directory
2. For each subdirectory, read `config.yaml`
3. Display table: original name, created date, timeout (if custom)

### Update (sandctl repo edit)

1. Parse repository argument
2. Normalize name for lookup
3. Verify config exists → error if not
4. Open `init.sh` in user's editor (`$VISUAL`/`$EDITOR`/`vi`)

### Delete (sandctl repo remove)

1. Parse repository argument
2. Normalize name for lookup
3. Verify config exists → error if not
4. Prompt for confirmation (unless `--force`)
5. Remove entire directory: `~/.sandctl/repos/<repo>/`

### Lookup (during sandctl new -R)

1. Parse `-R` flag value
2. Normalize name for lookup
3. Check if `~/.sandctl/repos/<normalized>/init.sh` exists
4. If exists: read script content, add "Running init script" step
5. If not exists: continue without init script (existing behavior)

## Validation Rules

### Repository Name
- Must match GitHub `owner/repo` format or full GitHub URL
- Owner: 1-39 characters, alphanumeric + hyphen, no leading/trailing hyphen
- Repo: 1-100 characters, alphanumeric + `.`, `_`, `-`

### Normalized Name
- All lowercase
- Single hyphen between owner and repo
- No `.git` suffix
- Pattern: `^[a-z0-9][a-z0-9-]*[a-z0-9]-[a-z0-9][a-z0-9._-]*$`

### Init Script
- Must be readable (validated at creation and execution time)
- No validation of script content (user responsibility)
- Timeout enforced at execution time (default 10 minutes)

## State Transitions

Init scripts don't have explicit states, but the repository configuration has an implicit lifecycle:

```
(none) --[repo add]--> Configured --[repo edit]*--> Configured
                            |
                            +--[repo remove]--> (none)
```

The `Configured` state means:
- Directory exists at `~/.sandctl/repos/<repo>/`
- Both `config.yaml` and `init.sh` exist
- Script may or may not have user modifications

## Error Cases

| Scenario | Error Message |
|----------|---------------|
| `repo add` with existing config | "Repository 'owner/repo' is already configured. Use 'sandctl repo edit' to modify." |
| `repo show/edit/remove` with missing config | "No configuration found for repository 'owner/repo'. Use 'sandctl repo add' first." |
| `repo add` with invalid repo format | "Invalid repository format. Use 'owner/repo' or full GitHub URL." |
| Init script missing at runtime | "Init script not found for 'owner/repo'. Run 'sandctl repo edit owner/repo' to recreate." |
| Init script not readable | "Cannot read init script for 'owner/repo': permission denied" |
