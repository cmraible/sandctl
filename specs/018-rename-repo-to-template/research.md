# Research: Rename Repo Commands to Template

**Feature Branch**: `018-rename-repo-to-template`
**Date**: 2026-01-27

## Research Tasks

### 1. Template Name Normalization Strategy

**Decision**: Use simple lowercase normalization with special character replacement

**Rationale**:
- Templates use simple user-chosen names (e.g., "Ghost", "my-fullstack-env") instead of owner/repo format
- No need for complex URL parsing or validation that the repo package provided
- Simpler normalization: lowercase only, replace spaces and special chars with hyphens

**Alternatives Considered**:
- Keep the owner/repo normalization (rejected: unnecessary complexity for simple names)
- No normalization at all (rejected: filesystem compatibility issues with special characters)
- Use UUID-based storage (rejected: loses human-readable directory names)

**Implementation**:
```go
func NormalizeName(name string) string {
    // Convert to lowercase
    name = strings.ToLower(name)
    // Replace spaces and special chars with hyphens
    name = regexp.MustCompile(`[^a-z0-9-]`).ReplaceAllString(name, "-")
    // Collapse multiple hyphens
    name = regexp.MustCompile(`-+`).ReplaceAllString(name, "-")
    // Trim leading/trailing hyphens
    name = strings.Trim(name, "-")
    return name
}
```

### 2. Editor Detection for Template Editing

**Decision**: Use existing editor detection pattern from repo_add.go

**Rationale**: The current implementation already handles:
- `$EDITOR` environment variable (primary)
- `$VISUAL` environment variable (fallback)
- Common defaults: `vim`, `vi`, `nano` (system fallback)

**Alternatives Considered**:
- Hard-code `vim` only (rejected: unfriendly to non-vim users)
- Require `$EDITOR` to be set (rejected: bad UX, error message needed anyway)
- Interactive editor selection (rejected: over-engineering for edge case)

### 3. Template Storage Structure

**Decision**: Maintain existing structure pattern from repoconfig

**Rationale**: The current structure is simple and effective:
```
~/.sandctl/templates/<normalized-name>/
├── config.yaml    # Metadata (0600 permissions)
└── init.sh        # Executable script (0700 permissions)
```

**Alternatives Considered**:
- Single JSON file for all templates (rejected: harder to edit manually, merge conflicts)
- SQLite database (rejected: over-engineering, harder to debug)
- XDG config directories (rejected: inconsistent with existing sandctl patterns)

### 4. Deletion Confirmation UX

**Decision**: Interactive prompt "Delete template 'Ghost'? [y/N]" with default No

**Rationale**:
- Prevents accidental data loss
- Default to No (safe option) if user presses Enter
- Consistent with Unix conventions (y/N capitalization indicates default)

**Alternatives Considered**:
- `--force` flag only (rejected: spec requires interactive confirmation)
- Type template name to confirm (rejected: over-engineering for simple case)
- Undo/trash functionality (rejected: adds significant complexity)

**Implementation Notes**:
- Check `os.Stdin` is a terminal before prompting
- For non-interactive mode (piped input), require `--force/-f` flag
- Use `golang.org/x/term.IsTerminal()` for detection

### 5. Environment Variables for Init Scripts

**Decision**: Introduce new `SANDCTL_TEMPLATE_*` variables, remove old `SANDCTL_REPO_*` variables

**Rationale**:
- Breaking change by design - no backward compatibility
- Cleaner naming aligned with new template concept
- Old variables referenced GitHub-specific concepts (REPO_URL, REPO_PATH) that no longer apply

**New Variables**:
| Variable | Description | Example |
|----------|-------------|---------|
| `SANDCTL_TEMPLATE_NAME` | Original template name | `Ghost` |
| `SANDCTL_TEMPLATE_NORMALIZED` | Normalized template name | `ghost` |

**Removed Variables** (breaking change):
- `SANDCTL_REPO_URL` - No longer applicable
- `SANDCTL_REPO_PATH` - No longer applicable
- `SANDCTL_REPO` - Replaced by `SANDCTL_TEMPLATE_NAME`

### 6. Case-Insensitive Template Lookup

**Decision**: Store normalized (lowercase) names, preserve original for display

**Rationale**:
- FR-010 requires case-insensitive lookups (Ghost, ghost, GHOST all work)
- Store `original_name` in config.yaml for display purposes
- Directory names are always normalized (lowercase)

**Implementation**:
```go
func (s *Store) Get(name string) (*TemplateConfig, error) {
    normalized := NormalizeName(name)
    // Look up by normalized name (case-insensitive)
    return s.getByNormalized(normalized)
}
```

### 7. Init Script Template Content

**Decision**: Generate minimal starter script with helpful comments

**Rationale**:
- New users need guidance on what's possible
- Script should be immediately useful without requiring edits
- Include common patterns (apt-get, directory creation)

**Template**:
```bash
#!/bin/bash
# Init script for template: {{.OriginalName}}
# This script runs on the sandbox VM after creation.
#
# Available environment variables:
#   SANDCTL_TEMPLATE_NAME       - Original template name
#   SANDCTL_TEMPLATE_NORMALIZED - Normalized template name (lowercase)
#
# Examples:
#   apt-get update && apt-get install -y nodejs npm
#   git clone https://github.com/your/repo.git /home/agent/project
#   cd /home/agent/project && npm install

echo "Template '{{.OriginalName}}' initialized successfully"
```

### 8. Error Messages

**Decision**: Clear, actionable error messages for all failure modes

| Scenario | Error Message |
|----------|---------------|
| Template already exists | `Error: Template 'Ghost' already exists. Use 'sandctl template edit Ghost' to modify it.` |
| Template not found | `Error: Template 'Ghost' not found. Use 'sandctl template list' to see available templates.` |
| Empty template name | `Error: Template name is required.` |
| Non-interactive deletion | `Error: Confirmation required. Run in interactive terminal or use --force flag.` |
| Editor not found | `Error: No editor found. Set the EDITOR environment variable.` |

## Summary

All NEEDS CLARIFICATION items have been resolved. Key decisions:

1. **Simple normalization** - Lowercase + hyphen replacement
2. **Existing editor pattern** - Reuse $EDITOR/$VISUAL fallback chain
3. **Same storage pattern** - config.yaml + init.sh per template
4. **Interactive confirmation** - y/N prompt with --force flag for scripts
5. **New environment variables** - SANDCTL_TEMPLATE_* (breaking change)
6. **Case-insensitive lookups** - Normalize on lookup, preserve original for display
7. **Helpful starter script** - Comments and examples in generated init.sh
8. **Clear error messages** - Actionable guidance for all failure modes
