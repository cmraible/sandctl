# Research: Human-Readable Sandbox Names

**Feature**: 003-human-readable-names
**Date**: 2026-01-22

## Research Topics

### 1. Name Pool Composition

**Question**: What names should be included in the pool?

**Decision**: Use a curated list of 250 common, internationally recognizable first names that are:
- Easy to spell and pronounce across English speakers
- Gender-diverse (mix of traditionally masculine, feminine, and neutral names)
- Short (3-8 characters preferred) for easy typing
- Avoiding names that could be offensive or problematic

**Rationale**:
- 250 names provides 10x headroom over typical usage (20 concurrent sandboxes)
- Short names reduce typing effort
- International mix reflects diverse user base
- Embedded in code is simpler than external file management

**Alternatives Considered**:
1. Random word pairs (e.g., "happy-tiger") - Rejected: longer to type, less memorable
2. Docker-style adjective-noun (e.g., "clever_curie") - Rejected: still requires copy-paste for precision
3. External name file - Rejected: adds deployment complexity for minimal benefit

### 2. Random Selection Algorithm

**Question**: How should names be selected to ensure randomness and avoid collisions?

**Decision**: Use Go's `crypto/rand` for secure random selection with retry on collision:
1. Generate random index into name pool
2. Check if name is in use (via session store)
3. If collision, retry with new random index (up to 10 attempts)
4. If all retries fail, return error suggesting user destroy unused sandboxes

**Rationale**:
- `crypto/rand` provides unpredictable selection (consistent with existing ID generation)
- Retry approach is simple and effective for small collision rates
- 10 retries is sufficient: with 20 active sessions from 250 names, collision probability per attempt is 8%, so 10 retries virtually guarantees success

**Alternatives Considered**:
1. Sequential assignment - Rejected: predictable, doesn't feel random to users
2. Shuffle pool and pop - Rejected: requires persistent state for shuffle order
3. Exclude used names before selection - Rejected: more complex, marginal benefit

### 3. Case-Insensitive Matching

**Question**: How should case be handled for name matching?

**Decision**:
- Store names in lowercase
- Accept any case from user input
- Normalize to lowercase before lookup

**Rationale**:
- Users may type "Alice", "alice", or "ALICE" - all should work
- Lowercase storage is canonical and consistent
- Standard pattern for identifiers in CLI tools

**Implementation**:
```go
// Normalize name for storage and lookup
func NormalizeName(name string) string {
    return strings.ToLower(strings.TrimSpace(name))
}
```

### 4. Migration Path from Hex IDs

**Question**: Should existing sessions with hex IDs continue to work?

**Decision**: No migration required for this feature:
- The session store is local (user's machine)
- Users can destroy old sessions before upgrading
- New sessions will use human names immediately
- Old hex-based names will still be valid if present in store

**Rationale**:
- Simplifies implementation
- Users of CLI tools expect clean upgrades
- No data loss - old sessions remain accessible until destroyed

### 5. Name Validation Pattern

**Question**: What pattern should validate human-readable names?

**Decision**: Names must match `^[a-z]{2,15}$`:
- Lowercase letters only
- 2-15 characters
- No numbers, hyphens, or special characters

**Rationale**:
- Matches requirements (FR-003: no numeric portions)
- Simple regex for validation
- 15-char max allows longer names like "christopher" while keeping reasonable
- 2-char min prevents single-letter confusion

### 6. Pool Exhaustion Handling

**Question**: What happens when all names are in use?

**Decision**: Return a clear error message:
```
Error: No available names. Please destroy unused sandboxes with 'sandctl destroy <name>'
```

**Rationale**:
- With 250 names and typical 1-20 usage, exhaustion is extremely rare
- Clear error guides user to resolution
- Simpler than implementing fallback strategies (numbered suffixes, etc.)

**Alternatives Considered**:
1. Add numeric suffix (alice-2) - Rejected: violates FR-003 requirement
2. Expand pool dynamically - Rejected: over-engineering for rare case
3. Use secondary pool - Rejected: complexity without benefit

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Pool size | 250 embedded names |
| Selection | Random with retry on collision |
| Case handling | Store lowercase, accept any case |
| Validation | `^[a-z]{2,15}$` |
| Migration | None required |
| Pool exhaustion | Clear error message |
