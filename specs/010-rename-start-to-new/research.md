# Research: Rename Start Command to New

**Feature**: 010-rename-start-to-new
**Date**: 2026-01-25

## Overview

This feature is a straightforward refactoring task with no external unknowns requiring research. All technical decisions are guided by existing codebase patterns.

## Decisions

### 1. Command Naming Convention

**Decision**: Use `new` as the command name
**Rationale**:
- Matches common CLI patterns (e.g., `git new`, `npm new`, `kubectl new`)
- Clearer intent: "new session" vs "start session" (which implied starting something that was already created)
- Shorter to type

**Alternatives considered**:
- `create`: Rejected - more verbose, `new` is more idiomatic for CLI tools
- `spawn`: Rejected - less intuitive for end users

### 2. File Renaming Strategy

**Decision**: Rename `internal/cli/start.go` to `internal/cli/new.go`
**Rationale**:
- Maintains 1:1 mapping between command name and file name
- Follows existing pattern in the codebase (e.g., `init.go`, `list.go`, `destroy.go`)

**Alternatives considered**:
- Keep as `start.go` with aliased command: Rejected - confusing for maintainers

### 3. Prompt Field Removal

**Decision**: Remove `Prompt` field from `Session` struct entirely
**Rationale**:
- Clarified in spec: clean slate approach
- Avoids confusion about unused fields
- Reduces data storage footprint

**Alternatives considered**:
- Keep as optional field: Rejected - adds complexity for no benefit

### 4. Backward Compatibility

**Decision**: No backward compatibility (breaking change)
**Rationale**:
- Per spec FR-013: old `start` command should return "unknown command" error
- Clean break is simpler than maintaining aliases
- Users can easily adapt (`start` → `new`)

**Alternatives considered**:
- Add alias/deprecation warning: Rejected - over-engineering for a simple rename

### 5. Test Strategy

**Decision**: Update existing e2e tests to use `new` command
**Rationale**:
- Tests already exist for `start` command functionality
- Rename tests rather than create new ones
- Add test to verify `start` returns unknown command error

## No External Research Required

This feature does not require:
- External API documentation review
- Third-party library evaluation
- Performance benchmarking
- Security analysis

All changes are internal refactoring of existing, well-understood code.
