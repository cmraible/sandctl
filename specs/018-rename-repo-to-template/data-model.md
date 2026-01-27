# Data Model: Rename Repo Commands to Template

**Feature Branch**: `018-rename-repo-to-template`
**Date**: 2026-01-27

## Entities

### TemplateConfig

Configuration metadata for a template, stored in YAML format.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `template` | string | Normalized template name (lowercase, hyphens) | Required, 1-100 chars, `[a-z0-9-]+` |
| `original_name` | string | User-provided template name | Required, 1-100 chars |
| `created_at` | time.Time | Template creation timestamp | Required, RFC3339 format |
| `timeout` | Duration | Custom init script timeout | Optional, default 10m |

**Storage Location**: `~/.sandctl/templates/<template>/config.yaml`

**File Permissions**: 0600 (owner read/write only)

**Example**:
```yaml
template: ghost
original_name: Ghost
created_at: 2026-01-27T10:30:00Z
timeout: 15m
```

### InitScript

Executable shell script for template initialization.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| Content | string (file) | Bash script content | Must start with shebang |

**Storage Location**: `~/.sandctl/templates/<template>/init.sh`

**File Permissions**: 0700 (owner read/write/execute)

**Example**:
```bash
#!/bin/bash
echo "Initializing Ghost template"
apt-get update && apt-get install -y nodejs npm
```

## Relationships

```text
Template Directory (~/.sandctl/templates/<normalized-name>/)
├── config.yaml (1:1 with directory)
└── init.sh (1:1 with directory)
```

- Each template has exactly one config.yaml
- Each template has exactly one init.sh
- Template name uniqueness enforced by directory naming

## State Transitions

### Template Lifecycle

```text
[Not Exists] --add--> [Created] --edit--> [Modified] --remove--> [Not Exists]
```

| State | Description | Transitions |
|-------|-------------|-------------|
| Not Exists | No directory for template | → Created (via `template add`) |
| Created | Directory exists with config.yaml and init.sh | → Modified (via `template edit`), → Not Exists (via `template remove`) |
| Modified | Same as Created, init.sh has been edited | → Not Exists (via `template remove`) |

### Validation Rules

1. **Template Name**:
   - Must not be empty
   - Must be 1-100 characters after normalization
   - Must contain only alphanumeric characters and hyphens after normalization

2. **Uniqueness**:
   - Template names are case-insensitive
   - `Ghost`, `ghost`, and `GHOST` all resolve to the same template
   - Creating a duplicate returns an error

3. **Init Script**:
   - Must be valid UTF-8
   - Should start with `#!/bin/bash` (warning if missing)
   - Maximum size: 1MB

## Storage Schema

### Directory Structure

```text
~/.sandctl/
├── config           # Global sandctl config (unchanged)
├── sessions.json    # Session tracking (unchanged)
└── templates/       # NEW: Template storage (replaces repos/)
    ├── ghost/
    │   ├── config.yaml
    │   └── init.sh
    ├── react-fullstack/
    │   ├── config.yaml
    │   └── init.sh
    └── my-api/
        ├── config.yaml
        └── init.sh
```

### Config YAML Schema

```yaml
# JSON Schema for config.yaml
type: object
required:
  - template
  - original_name
  - created_at
properties:
  template:
    type: string
    pattern: "^[a-z0-9-]+$"
    minLength: 1
    maxLength: 100
  original_name:
    type: string
    minLength: 1
    maxLength: 100
  created_at:
    type: string
    format: date-time
  timeout:
    type: string
    pattern: "^[0-9]+(s|m|h)$"
    default: "10m"
```

## Migration Notes

### Breaking Changes

This feature performs a **hard cutover** with no backward compatibility:

1. **Old storage ignored**: Existing `~/.sandctl/repos/` directory is not read or migrated
2. **Old flags removed**: `-R/--repo` flag completely removed from `sandctl new`
3. **No automatic migration**: Users must manually recreate templates

### Manual Migration Steps (for users)

```bash
# View old repo configurations
ls ~/.sandctl/repos/

# For each repo, create equivalent template
sandctl template add <name>
# Edit the init.sh to match old repo's init.sh
sandctl template edit <name>

# Old repos can be deleted after migration
rm -rf ~/.sandctl/repos/
```

## Go Type Definitions

```go
// internal/templateconfig/types.go

package templateconfig

import "time"

// TemplateConfig represents a template's configuration metadata
type TemplateConfig struct {
    Template     string   `yaml:"template"`
    OriginalName string   `yaml:"original_name"`
    CreatedAt    time.Time `yaml:"created_at"`
    Timeout      Duration  `yaml:"timeout,omitempty"`
}

// Duration wraps time.Duration for YAML marshaling
type Duration struct {
    time.Duration
}

// GetTimeout returns the configured timeout or default 10 minutes
func (c *TemplateConfig) GetTimeout() time.Duration {
    if c.Timeout.Duration == 0 {
        return 10 * time.Minute
    }
    return c.Timeout.Duration
}
```

```go
// internal/templateconfig/store.go

package templateconfig

// Store provides template configuration persistence
type Store struct {
    baseDir string // ~/.sandctl/templates
}

// NewStore creates a store with the default base directory
func NewStore() (*Store, error)

// Add creates a new template with default init script
func (s *Store) Add(name string) (*TemplateConfig, error)

// Get retrieves a template by name (case-insensitive)
func (s *Store) Get(name string) (*TemplateConfig, error)

// List returns all configured templates
func (s *Store) List() ([]*TemplateConfig, error)

// Remove deletes a template's directory
func (s *Store) Remove(name string) error

// GetInitScript returns the init.sh content for a template
func (s *Store) GetInitScript(name string) (string, error)

// GetInitScriptPath returns the filesystem path to init.sh
func (s *Store) GetInitScriptPath(name string) (string, error)

// Exists checks if a template exists (case-insensitive)
func (s *Store) Exists(name string) bool
```

```go
// internal/templateconfig/normalize.go

package templateconfig

// NormalizeName converts a user-provided name to filesystem-safe format
// Examples: "Ghost" -> "ghost", "My API" -> "my-api", "React/Vue" -> "react-vue"
func NormalizeName(name string) string
```
