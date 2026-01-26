# CLI Contract: Repository Initialization Scripts

**Feature**: 014-repo-init-scripts
**Date**: 2026-01-25

## Command: `sandctl repo`

Parent command for repository configuration management.

```
sandctl repo <subcommand>
```

### Subcommand: `sandctl repo add`

Create a new repository configuration with an init script template.

**Usage**:
```
sandctl repo add [flags]
```

**Flags**:
| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--repo` | `-R` | string | (prompt) | Repository name (owner/repo) or GitHub URL |
| `--timeout` | `-t` | duration | 10m | Init script execution timeout |

**Behavior**:
1. If `--repo` not provided, prompt: "Repository (owner/repo or URL): "
2. Parse and validate repository specification
3. Check for existing configuration → error if exists
4. Create configuration directory and files
5. Print path to init.sh

**Output** (success):
```
Created init script for tryghost/ghost
Edit your script at: ~/.sandctl/repos/tryghost-ghost/init.sh
```

**Output** (already exists):
```
Error: Repository 'tryghost/ghost' is already configured
Use 'sandctl repo edit tryghost/ghost' to modify the init script
```

**Exit codes**:
- `0`: Success
- `1`: Error (invalid input, already exists, filesystem error)

---

### Subcommand: `sandctl repo list`

List all configured repositories.

**Usage**:
```
sandctl repo list [flags]
```

**Aliases**: `ls`

**Flags**:
| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--json` | | bool | false | Output as JSON |

**Output** (table, default):
```
REPOSITORY          CREATED              TIMEOUT
TryGhost/Ghost      2026-01-25 10:30    10m
facebook/react      2026-01-24 14:22    15m
```

**Output** (json):
```json
[
  {
    "repo": "tryghost-ghost",
    "original_name": "TryGhost/Ghost",
    "created_at": "2026-01-25T10:30:00Z",
    "timeout": "10m0s"
  }
]
```

**Output** (no configs):
```
No repository configurations found.
Use 'sandctl repo add' to create one.
```

**Exit codes**:
- `0`: Success (even if empty list)

---

### Subcommand: `sandctl repo show`

Display the init script for a repository.

**Usage**:
```
sandctl repo show <repository>
```

**Arguments**:
| Argument | Required | Description |
|----------|----------|-------------|
| `repository` | Yes | Repository name (owner/repo) or normalized name |

**Output** (success):
```
# Init script for TryGhost/Ghost
# Path: ~/.sandctl/repos/tryghost-ghost/init.sh

#!/bin/bash
# Init script for TryGhost/Ghost
...
```

**Output** (not found):
```
Error: No configuration found for repository 'unknown/repo'
Use 'sandctl repo add' to create one
```

**Exit codes**:
- `0`: Success
- `1`: Error (not found)

---

### Subcommand: `sandctl repo edit`

Open the init script in the user's editor.

**Usage**:
```
sandctl repo edit <repository>
```

**Arguments**:
| Argument | Required | Description |
|----------|----------|-------------|
| `repository` | Yes | Repository name (owner/repo) or normalized name |

**Behavior**:
1. Resolve repository to configuration path
2. Verify configuration exists → error if not
3. Determine editor: `$VISUAL` → `$EDITOR` → `vi`
4. Print: "Opening in {editor}..."
5. Launch editor with init.sh path
6. Wait for editor to exit

**Output** (success):
```
Opening in vim...
```
(editor opens, user edits, editor closes)

**Output** (not found):
```
Error: No configuration found for repository 'unknown/repo'
Use 'sandctl repo add' to create one
```

**Exit codes**:
- `0`: Success (editor exited normally)
- `1`: Error (not found, editor failed)

---

### Subcommand: `sandctl repo remove`

Delete a repository configuration.

**Usage**:
```
sandctl repo remove <repository> [flags]
```

**Aliases**: `rm`, `delete`

**Arguments**:
| Argument | Required | Description |
|----------|----------|-------------|
| `repository` | Yes | Repository name (owner/repo) or normalized name |

**Flags**:
| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--force` | `-f` | bool | false | Skip confirmation prompt |

**Behavior**:
1. Resolve repository to configuration path
2. Verify configuration exists → error if not
3. Unless `--force`: prompt "Remove configuration for '{repo}'? [y/N]: "
4. If confirmed: delete configuration directory
5. Print confirmation

**Output** (success):
```
Removed configuration for tryghost/ghost
```

**Output** (cancelled):
```
Cancelled
```

**Output** (not found):
```
Error: No configuration found for repository 'unknown/repo'
```

**Exit codes**:
- `0`: Success or cancelled
- `1`: Error (not found, filesystem error)

---

## Modified Command: `sandctl new`

The existing `new` command is modified to execute init scripts when present.

**New behavior** (when `-R` flag is used):
1. Parse repository specification
2. Check for init script at `~/.sandctl/repos/<normalized>/init.sh`
3. If found: add "Running init script" step after "Cloning repository"
4. Execute script with configured timeout
5. Stream script output to user
6. On failure: print error, exit without console, print sprite name for debugging

**Output** (with init script, success):
```
Creating new session...
✓ Provisioning VM
✓ Installing development tools
✓ Cloning repository
✓ Running init script
✓ Installing OpenCode
✓ Setting up OpenCode authentication

Session created: mango
Connecting to console...
Repository cloned to: /home/sprite/Ghost
```

**Output** (with init script, failure):
```
Creating new session...
✓ Provisioning VM
✓ Installing development tools
✓ Cloning repository
✗ Running init script

Init script failed for 'TryGhost/Ghost':
npm ERR! code ENOENT
npm ERR! syscall open
...

Session 'mango' is available for debugging.
Use 'sandctl console mango' to connect.
```

**Exit codes** (init script related):
- `0`: Success (all steps including init script)
- `1`: Init script failed (session still exists for debugging)

---

## Environment Variables

| Variable | Purpose | Fallback |
|----------|---------|----------|
| `VISUAL` | Preferred full-screen editor | Check `$EDITOR` |
| `EDITOR` | Preferred editor | Use `vi` |

---

## File Paths

| Purpose | Path | Permissions |
|---------|------|-------------|
| Repos directory | `~/.sandctl/repos/` | 0700 |
| Repo config dir | `~/.sandctl/repos/<repo>/` | 0700 |
| Config metadata | `~/.sandctl/repos/<repo>/config.yaml` | 0600 |
| Init script | `~/.sandctl/repos/<repo>/init.sh` | 0755 |
