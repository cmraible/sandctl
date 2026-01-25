# Research: Auto Console After New

**Feature**: 012-auto-console-after-new
**Date**: 2026-01-25

## Technical Decisions

### 1. Reuse Console Infrastructure

**Decision**: Call `runSpriteConsole()` from console.go directly rather than duplicating code.

**Rationale**: The console command already implements:
- Sprite CLI detection and fallback to WebSocket
- Terminal state management (raw mode, restoration)
- Signal handling (SIGINT, SIGTERM)
- Auth failure detection and fallback

**Alternatives Considered**:
- Duplicate console logic in new.go: Rejected due to code duplication and maintenance burden
- Create shared package: Overkill for this use case, functions can be shared within cli package

### 2. Non-TTY Detection Strategy

**Decision**: Check `term.IsTerminal(int(os.Stdin.Fd()))` before attempting console connection.

**Rationale**:
- Same pattern used by console command (proven approach)
- Automatically handles CI, piped input, and script usage
- No additional dependencies required

**Alternatives Considered**:
- Check only if --no-console flag is set: Rejected as it would break scripts that don't know about the new flag
- Check if stdout is a terminal: Stdin is more reliable for interactive session detection

### 3. Flag Name: --no-console

**Decision**: Use `--no-console` as an opt-out flag rather than `--console` as an opt-in flag.

**Rationale**:
- Makes the new default behavior (auto-console) the expected experience
- Existing scripts need to opt out, not opt in
- Clearer intent: "I specifically don't want console"
- Shorter common case (just `sandctl new`)

**Alternatives Considered**:
- `--console` (opt-in): Rejected because it makes the common interactive case require a flag
- `--skip-console`: Rejected as less idiomatic than `--no-*` pattern

### 4. Error Handling on Console Failure

**Decision**: If console connection fails after successful provisioning, print error and session name, return nil (success).

**Rationale**:
- The primary operation (session creation) succeeded
- Failing the command would be confusing since the session exists
- User can retry connection with `sandctl console <name>`
- Aligns with graceful degradation principle

**Alternatives Considered**:
- Return error: Rejected because session was created successfully
- Silent failure: Rejected because user needs to know how to connect manually

### 5. Message Sequencing

**Decision**: Show "Session created: <name>" before starting console, with a brief message indicating console is starting.

**Rationale**:
- User needs to know session name for reconnection
- Clear transition from provisioning to console phase
- Aligns with FR-002 (session name must be displayed before console)

**Message Sequence**:
```
✓ Provisioning VM
✓ Installing development tools
✓ Installing OpenCode
✓ Setting up OpenCode authentication

Session created: alice
Connecting to console...
[interactive session starts]
```

### 6. E2E Test Updates

**Decision**: Update existing E2E tests to use `--no-console` flag to maintain test behavior.

**Rationale**:
- E2E tests run without TTY, so auto-console would be skipped anyway
- Being explicit with `--no-console` makes test intent clear
- Tests can verify both behaviors (with and without flag)

## Implementation Notes

### Functions to Reuse from console.go

- `runSpriteConsole(sessionID string) error` - Main console entry point
- No need to export these; they're in the same package

### Changes to new.go

1. Add `noConsole` flag variable
2. Add flag registration in `init()`
3. Add import for `golang.org/x/term`
4. After provisioning success, check TTY and flag, then call `runSpriteConsole()`
5. Handle console errors gracefully (print message, don't fail command)

### Minimal Code Changes

The implementation requires approximately:
- 1 new flag variable
- 1 new import
- ~20 lines of logic after provisioning
- Updates to help text

## Dependencies

- golang.org/x/term (already in go.mod from console command)
- No new external dependencies

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Break existing scripts | Medium | High | --no-console flag for backward compatibility |
| Console fails after provisioning | Low | Medium | Graceful error handling, show session name |
| TTY detection incorrect | Low | Low | Use proven term.IsTerminal pattern |
