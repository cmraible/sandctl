# Research: Console Command

**Feature**: 011-console-command
**Date**: 2026-01-25

## Research Tasks

### 1. Terminal Detection Pattern

**Question**: How to detect if stdin is a terminal vs piped input?

**Decision**: Use `term.IsTerminal(int(os.Stdin.Fd()))` from `golang.org/x/term`

**Rationale**: This is the standard Go approach, already used implicitly in the codebase. The `term` package is already a dependency (v0.30.0) and provides cross-platform terminal detection.

**Alternatives Considered**:
- `os.Stdin.Stat()` with mode check: More complex, less portable
- Checking `$TERM` environment variable: Not reliable for piped input detection

**Code Pattern**:
```go
import "golang.org/x/term"

if !term.IsTerminal(int(os.Stdin.Fd())) {
    return fmt.Errorf("console requires an interactive terminal; use 'sandctl exec -c <command>' for non-interactive execution")
}
```

### 2. Terminal Resize Handling (SIGWINCH)

**Question**: How to propagate terminal resize events to the remote session?

**Decision**: The existing WebSocket implementation in `internal/sprites/exec.go` sets initial terminal dimensions via query parameters (`cols`, `rows`). For resize support, we need to:
1. Listen for SIGWINCH signal
2. Get new terminal size via `term.GetSize()`
3. Send resize control message over WebSocket

**Rationale**: SSH-like experience requires dynamic resize support. The Sprites API likely supports resize messages (standard for PTY-based sessions).

**Alternatives Considered**:
- Fixed terminal size: Simpler but poor UX, rejected per spec requirements
- Polling for size changes: Inefficient, signal-based is standard

**Implementation Note**: Need to verify Sprites API supports resize messages. If not, document as known limitation with fixed initial dimensions.

**Code Pattern**:
```go
// Signal handling for resize
sigwinch := make(chan os.Signal, 1)
signal.Notify(sigwinch, syscall.SIGWINCH)

go func() {
    for range sigwinch {
        width, height, err := term.GetSize(int(os.Stdin.Fd()))
        if err == nil {
            // Send resize message to WebSocket (API-dependent)
        }
    }
}()
```

### 3. Difference from `exec` Command

**Question**: How should `console` differ from `exec` in interactive mode?

**Decision**: `console` is a focused, SSH-like command with these differences:

| Aspect | `exec` | `console` |
|--------|--------|-----------|
| Primary use | Run single commands or interactive | Interactive terminal only |
| `-c` flag | Supports single command execution | Not supported |
| Non-terminal stdin | Allowed (for piped commands) | Rejected with helpful message |
| User mental model | "Execute something in the sandbox" | "SSH into the sandbox" |

**Rationale**: Clear separation of concerns improves UX. Users wanting SSH-like access use `console`; users wanting to run scripts or pipe commands use `exec -c`.

**Alternatives Considered**:
- Alias `console` to `exec` with flags: Confusing, doesn't express intent
- Add `--interactive-only` flag to exec: Adds complexity to existing command

### 4. Exit Behavior and Terminal Restoration

**Question**: How to ensure terminal state is always restored?

**Decision**: Use `defer` with explicit restoration, wrapped in a function that handles panics.

**Rationale**: The existing `exec` command pattern is correct but could fail to restore on panic. Adding recover() ensures restoration.

**Code Pattern**:
```go
oldState, err := term.MakeRaw(int(os.Stdin.Fd()))
if err != nil {
    verboseLog("Warning: failed to set raw mode: %v", err)
    // Continue with degraded experience
} else {
    defer func() {
        _ = term.Restore(int(os.Stdin.Fd()), oldState)
        fmt.Println() // Clean newline after session
    }()
}
```

### 5. Error Messages and Exit Codes

**Question**: What exit codes should `console` use?

**Decision**: Reuse existing exit codes from `internal/ui/errors.go`:

| Scenario | Exit Code | Constant |
|----------|-----------|----------|
| Success | 0 | `ExitSuccess` |
| General error | 1 | `ExitGeneralError` |
| Config error | 2 | `ExitConfigError` |
| API error | 3 | `ExitAPIError` |
| Session not found | 4 | `ExitSessionNotFound` |
| Session not ready | 5 | `ExitSessionNotReady` |
| Non-terminal stdin | 1 | `ExitGeneralError` (new scenario, use general) |

**Rationale**: Consistent with existing commands. Non-terminal stdin is a user error, not a system failure.

### 6. WebSocket Session Reuse

**Question**: Can we reuse `sprites.ExecWebSocket()` directly?

**Decision**: Yes, with minor adjustments:
- Pass `Interactive: true` always
- Set terminal dimensions from current terminal size (not hardcoded)
- Handle the session exactly as `exec` does in interactive mode

**Rationale**: The existing implementation is well-tested and handles all the complexity of WebSocket communication, raw terminal mode, and bidirectional I/O.

**Code Pattern**:
```go
width, height, _ := term.GetSize(int(os.Stdin.Fd()))
if width == 0 { width = 120 }  // fallback
if height == 0 { height = 40 }

execSession, err := client.ExecWebSocket(ctx, sessionID, sprites.ExecOptions{
    Interactive: true,
    Stdin:       os.Stdin,
    Stdout:      os.Stdout,
    Stderr:      os.Stderr,
    Cols:        width,   // May need to add to ExecOptions
    Rows:        height,
})
```

**Note**: Check if `ExecOptions` supports `Cols`/`Rows` fields. If not, the WebSocket URL query params are set in `sprites/exec.go` and may need modification.

## Summary

All technical questions resolved. The implementation is straightforward:

1. **New file**: `internal/cli/console.go` (~150 lines)
2. **Pattern**: Follow `exec.go` interactive session pattern
3. **Key addition**: Terminal detection check at start
4. **Reuse**: All existing infrastructure (session store, sprites client, WebSocket session)
5. **No new dependencies**: All required packages already in go.mod

## Open Items

1. **Verify Sprites API resize support**: Check if WebSocket accepts resize control messages. If not, document as limitation (initial size only).
2. **ExecOptions extension**: May need to add `Cols`/`Rows` fields if not already present, or modify WebSocket URL construction.
