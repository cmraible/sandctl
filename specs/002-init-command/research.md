# Research: Init Command

**Feature**: 002-init-command
**Date**: 2026-01-22

## Research Summary

This feature has no significant unknowns. The implementation uses established Go patterns and existing project dependencies.

---

## 1. Secure Terminal Input for Secrets

**Question**: How to read sensitive input (tokens, API keys) without echoing to terminal?

**Decision**: Use `golang.org/x/term.ReadPassword()`

**Rationale**:
- Already a dependency in go.mod (`golang.org/x/term v0.15.0`)
- Cross-platform (macOS, Linux, Windows)
- Standard Go approach for password-style input
- Returns `[]byte` to allow secure memory handling

**Alternatives Considered**:
- `github.com/howeyc/gopass`: External dependency, not needed since x/term is already present
- Manual termios manipulation: Platform-specific, error-prone

**Implementation**:
```go
import "golang.org/x/term"

func readSecret(prompt string) (string, error) {
    fmt.Print(prompt)
    bytePassword, err := term.ReadPassword(int(os.Stdin.Fd()))
    fmt.Println() // Add newline after hidden input
    if err != nil {
        return "", err
    }
    return string(bytePassword), nil
}
```

---

## 2. Agent Selection UI Pattern

**Question**: Best approach for presenting multiple-choice selection in terminal?

**Decision**: Numbered list with validation

**Rationale**:
- Simple, no additional dependencies
- Works in non-interactive pipes
- Matches existing CLI style (minimal, functional)
- Easy to test

**Alternatives Considered**:
- Arrow-key selection (survey/bubbletea): Heavy dependencies, overkill for 3 options
- Tab completion: Not standard for Cobra commands

**Implementation**:
```text
Select default AI agent:
  1. claude   - Anthropic Claude (recommended)
  2. opencode - OpenCode agent
  3. codex    - OpenAI Codex

Enter choice [1-3] (default: 1):
```

---

## 3. Config File Atomic Write

**Question**: How to safely write config without data loss on interruption?

**Decision**: Write to temporary file, then rename

**Rationale**:
- Rename is atomic on POSIX systems
- Existing config preserved if write fails
- Standard pattern for config file safety

**Alternatives Considered**:
- Direct overwrite: Risk of partial writes on interruption
- Backup-then-write: More complex, still has race conditions

**Implementation**:
```go
func writeConfigAtomic(path string, cfg *Config) error {
    dir := filepath.Dir(path)
    if err := os.MkdirAll(dir, 0700); err != nil {
        return err
    }

    tmp, err := os.CreateTemp(dir, ".config.tmp.*")
    if err != nil {
        return err
    }
    defer os.Remove(tmp.Name()) // Cleanup on error

    if err := tmp.Chmod(0600); err != nil {
        return err
    }

    encoder := yaml.NewEncoder(tmp)
    if err := encoder.Encode(cfg); err != nil {
        return err
    }
    tmp.Close()

    return os.Rename(tmp.Name(), path)
}
```

---

## 4. Ctrl+C Handling

**Question**: How to ensure clean exit when user cancels mid-flow?

**Decision**: Use signal handling with context

**Rationale**:
- Go's standard pattern for graceful shutdown
- Allows cleanup before exit
- Works with Cobra's interrupt handling

**Alternatives Considered**:
- Ignore (let OS handle): May leave terminal in bad state after ReadPassword
- Global signal handler: Already present in Cobra

**Implementation**:
- Cobra handles SIGINT by default
- ReadPassword returns error on interrupt, which propagates up
- No partial config written due to atomic write pattern

---

## 5. Non-Interactive Mode Detection

**Question**: How to detect if running in non-interactive (piped) context?

**Decision**: Check if flags are provided OR stdin is not a terminal

**Rationale**:
- Explicit flags indicate scripted use
- Terminal detection prevents hanging on piped input
- Allows hybrid mode (some flags + prompts for missing)

**Implementation**:
```go
func isInteractive() bool {
    return term.IsTerminal(int(os.Stdin.Fd()))
}

// In command:
if !isInteractive() && (spritesToken == "" || agent == "" || apiKey == "") {
    return errors.New("missing required flags for non-interactive mode")
}
```

---

## Conclusion

All research items resolved. No external dependencies needed beyond existing go.mod. Implementation can proceed with Phase 1 design.
