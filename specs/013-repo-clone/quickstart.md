# Quickstart: Repository Clone on Sprite Creation

**Feature**: 013-repo-clone
**Date**: 2026-01-25

## Overview

This feature adds the ability to specify a GitHub repository when creating a new sprite. The repository is cloned during provisioning, and you're dropped into the repository directory when connecting.

## Usage

### Clone a repository during sprite creation

```bash
# Using shorthand format
sandctl new -R TryGhost/Ghost

# Using full GitHub URL
sandctl new --repo https://github.com/TryGhost/Ghost

# With other flags
sandctl new -R facebook/react --timeout 2h
```

### What happens

1. Sprite is provisioned as usual
2. Development tools are installed
3. **Repository is cloned** to `/home/sprite/{repo-name}`
4. OpenCode is installed and configured
5. Console connects, starting in the repository directory

### Output example

```
Creating new session...
✓ Provisioning VM
✓ Installing development tools
✓ Cloning repository
✓ Installing OpenCode
✓ Setting up OpenCode authentication

Session created: alice
Connecting to console...

sprite@alice:~/Ghost$
```

## Supported Repository Formats

| Input | Resolved URL |
|-------|--------------|
| `owner/repo` | `https://github.com/owner/repo.git` |
| `https://github.com/owner/repo` | `https://github.com/owner/repo.git` |
| `https://github.com/owner/repo.git` | `https://github.com/owner/repo.git` |

## Error Handling

### Repository not found

```
Error: failed to clone repository: repository 'owner/nonexistent' not found
```

### Invalid repository format

```
Error: invalid repository format: expected 'owner/repo' or GitHub URL
```

### Clone timeout

```
Error: failed to clone repository: operation timed out after 10 minutes
```

## Limitations

- **Public repositories only**: Private repositories require authentication, which is not currently supported
- **GitHub only**: GitLab, Bitbucket, and other hosts are not supported
- **10-minute timeout**: Very large repositories may fail to clone within the timeout

## Implementation Files

| File | Purpose |
|------|---------|
| `internal/cli/new.go` | Add `--repo` flag and clone step |
| `internal/repo/parser.go` | Parse and validate repository specifications |
| `internal/cli/console.go` | Support working directory parameter |
| `tests/e2e/cli_test.go` | E2E tests for repo clone workflow |
