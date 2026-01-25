# Research: Repository Clone on Sprite Creation

**Feature**: 013-repo-clone
**Date**: 2026-01-25

## Research Tasks

### 1. Git Clone Timeout Handling

**Question**: How to implement a 10-minute timeout for git clone operations?

**Decision**: Use `timeout` command wrapper or `context.WithTimeout` with command execution

**Rationale**: The Sprites API `ExecCommand` uses HTTP with a 30-second default timeout. For long-running operations like git clone, we need to:
1. Create a custom HTTP client with 10-minute timeout for clone operations
2. Or use `timeout 600 git clone ...` shell command wrapper

The shell `timeout` approach is simpler and more reliable:
```bash
timeout 600 git clone https://github.com/owner/repo.git /home/sprite/repo
```

**Alternatives considered**:
- Custom HTTP client timeout: More complex; requires modifying client for specific calls
- Background job polling: Over-engineered for this use case

### 2. Repository URL Parsing

**Question**: How to parse both `owner/repo` shorthand and full GitHub URLs?

**Decision**: Regex-based parser with URL validation

**Rationale**: Support these input formats:
- `owner/repo` → `https://github.com/owner/repo.git`
- `https://github.com/owner/repo` → `https://github.com/owner/repo.git`
- `https://github.com/owner/repo.git` → use as-is

Validation rules:
- Owner: alphanumeric + hyphens, 1-39 chars, cannot start/end with hyphen
- Repo: alphanumeric + hyphens + underscores + dots, 1-100 chars

**Alternatives considered**:
- URL-only input: Less user-friendly; GitHub shorthand is common
- Git URL (git@github.com): Requires SSH key setup; public repos use HTTPS

### 3. Console Working Directory

**Question**: How to start the console session in the cloned repository directory?

**Decision**: Modify console command invocation to include working directory

**Rationale**: Two approaches available:
1. `sprite console` command may support `-w` or `--workdir` flag
2. Execute `cd /path && exec bash -l` as the shell command

Checking the sprite CLI behavior (external tool), the most portable approach is to use the WebSocket fallback path and set initial command, or modify how we invoke the sprite CLI.

For the sprite CLI path: `sprite console -s sessionID` - we'll check if it supports workdir flag.
For the WebSocket fallback: Use initial command `cd /home/sprite/repo && exec bash -l`.

**Alternatives considered**:
- Symlink ~/workspace to repo: Adds complexity; user may expect standard paths
- .bashrc modification: Persists across sessions; harder to undo

### 4. Error Message Differentiation

**Question**: How to distinguish "repository not found" from "access denied" errors?

**Decision**: Parse git clone stderr for specific error patterns

**Rationale**: Git clone output contains distinguishable error messages:
- Not found: `Repository not found` or `does not exist`
- Access denied: `Permission denied` or `Authentication failed`
- Network error: `Could not resolve host` or `Connection refused`
- Timeout: Exit code 124 from `timeout` command

Map these to user-friendly messages in the CLI output.

**Alternatives considered**:
- GitHub API pre-check: Adds latency; requires API token for private repo check
- Generic error only: Poor user experience

### 5. Clone Progress Indication

**Question**: How to show clone progress in the provisioning step UI?

**Decision**: Use existing `ui.ProgressStep` with "Cloning repository" message

**Rationale**: The current provisioning flow uses a spinner with step messages. Git clone will run silently (no TTY for progress bars), but the step message will indicate the operation is in progress.

The step list becomes:
1. "Provisioning VM"
2. "Installing development tools"
3. "Cloning repository" (NEW - only if --repo specified)
4. "Installing OpenCode"
5. "Setting up OpenCode authentication"

**Alternatives considered**:
- Stream git output: Complex; current API doesn't support streaming
- Periodic status updates: Over-engineered; spinner is sufficient

## Summary

All research questions resolved. No blockers for implementation.

| Topic | Decision | Risk Level |
|-------|----------|------------|
| Clone timeout | `timeout 600` shell wrapper | Low |
| URL parsing | Regex with GitHub format validation | Low |
| Working directory | Check sprite CLI; fallback to shell cd | Medium |
| Error messages | Parse git stderr patterns | Low |
| Progress UI | Existing spinner step system | Low |
