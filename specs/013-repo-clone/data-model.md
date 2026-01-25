# Data Model: Repository Clone on Sprite Creation

**Feature**: 013-repo-clone
**Date**: 2026-01-25

## Entities

### RepoSpec (New)

Represents a parsed repository specification from user input.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| Owner | string | GitHub owner/organization name | 1-39 chars, alphanumeric + hyphen, no leading/trailing hyphen |
| Name | string | Repository name | 1-100 chars, alphanumeric + hyphen + underscore + dot |
| CloneURL | string | Full HTTPS clone URL | Valid URL format |

**Derived Fields**:
- `TargetPath()` → `/home/sprite/{Name}` - where repo is cloned
- `String()` → `owner/name` - shorthand representation

**State Transitions**: N/A (immutable value object)

### Session (Existing - Extended)

The existing `session.Session` struct may optionally be extended:

| Field | Type | Description | Notes |
|-------|------|-------------|-------|
| ClonedRepo | *string | Repository that was cloned (owner/name format) | Optional; nil if no repo |

**Rationale**: Storing the cloned repo enables:
- `sandctl list` to show which sessions have repos
- Future feature: `sandctl console` could auto-cd if repo is known

**Alternative**: Don't store repo info. Simpler, but less informative.

## Relationships

```text
┌─────────────┐         ┌───────────────┐
│   Session   │ 0..1 ── │   RepoSpec    │
└─────────────┘         └───────────────┘
                              │
                              │ derived
                              ▼
                        ┌───────────────┐
                        │  Clone Target │
                        │  /home/sprite/{name}
                        └───────────────┘
```

## Validation Rules

### Repository Input Validation

```text
Input: "owner/repo" OR "https://github.com/owner/repo[.git]"

1. If starts with "https://":
   - Must match pattern: https://github.com/{owner}/{repo}[.git]
   - Extract owner and repo from URL path

2. If contains single "/":
   - Split on "/" to get owner and repo

3. Validate owner:
   - Length: 1-39 characters
   - Characters: [a-zA-Z0-9-]
   - Cannot start or end with hyphen

4. Validate repo:
   - Length: 1-100 characters
   - Characters: [a-zA-Z0-9._-]
   - Cannot be empty

5. Construct CloneURL:
   - https://github.com/{owner}/{repo}.git
```

### Error Cases

| Input | Error |
|-------|-------|
| `""` (empty) | "repository specification is required" |
| `"invalid"` | "invalid format: expected 'owner/repo' or GitHub URL" |
| `"a/b/c"` | "invalid format: expected 'owner/repo' or GitHub URL" |
| `"-owner/repo"` | "invalid owner: cannot start with hyphen" |
| `"owner/"` | "invalid repo: cannot be empty" |
| `"https://gitlab.com/..."` | "only GitHub repositories are supported" |

## File Storage Impact

### sessions.json

Current format:
```json
{
  "sessions": [
    {
      "id": "alice",
      "status": "running",
      "created_at": "2026-01-25T10:00:00Z",
      "timeout": null
    }
  ]
}
```

Extended format (optional):
```json
{
  "sessions": [
    {
      "id": "alice",
      "status": "running",
      "created_at": "2026-01-25T10:00:00Z",
      "timeout": null,
      "cloned_repo": "TryGhost/Ghost"
    }
  ]
}
```

**Backward Compatibility**: The `cloned_repo` field is optional. Existing sessions without this field work normally.
