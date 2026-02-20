# Engineer 3 — Session, List & Destroy Commands

**Stream**: C
**PRs**: PR-03, PR-06

## Ownership

You own session state management and the commands that read/delete sessions:

| Module | Files |
|--------|-------|
| Session types | `src/session/types.ts` |
| Session store | `src/session/store.ts` |
| Session names | `src/session/names.ts` |
| Session ID | `src/session/id.ts` |
| List command | `src/commands/list.ts` |
| Destroy command | `src/commands/destroy.ts` |
| Unit tests | `tests/unit/session/` |

---

## PR-03: Session Module (Tasks T019–T023)

**Blocked by**: PR-01 (scaffold)
**Blocks**: PR-06 (list + destroy), PR-07 (templates), PR-13 (new cmd), PR-14 (console), PR-15 (exec)

### What to Build

#### 1. Session Types (`src/session/types.ts`)

Define types matching Go structs exactly (see `data-model.md`):

```typescript
type Status = "provisioning" | "running" | "stopped" | "failed";

interface Session {
  id: string;              // Human-readable name (e.g., "alice")
  status: Status;
  provider: string;        // Provider name (e.g., "hetzner")
  provider_id: string;     // Provider-specific VM ID
  ip_address: string;
  region?: string;
  server_type?: string;
  created_at: string;      // ISO 8601
  timeout?: string;        // Duration string (e.g., "1h0m0s")
}
```

Helper methods:
- `isActive(session)` → true if provisioning or running
- `isTerminal(session)` → true if stopped or failed
- `timeoutRemaining(session)` → milliseconds remaining, or null
- `age(session)` → milliseconds since created_at

Custom `Duration` type with JSON serialization matching Go format (e.g., `"1h0m0s"`, `"30m0s"`).

Custom `NotFoundError` type.

#### 2. Name Pool (`src/session/names.ts`)

Port the exact 250-name array from `internal/session/names.go`. These must be **identical** to maintain compatibility with existing sessions.

```typescript
export const names: string[] = [
  "adam", "alex", "alice", "amber", "amy",
  // ... port ALL 250 names exactly from Go source
  "zachary", "zoe"
];
```

Implement `getRandomName(existingNames: string[])`:
- Pick random name from pool
- Retry up to 10 times if collision
- Fall back to linear search if retries exhausted
- Throw error if all 250 names are in use

#### 3. ID Generation (`src/session/id.ts`)

- `generateID(existingNames: string[])` → calls `getRandomName()`
- `validateID(id: string)` → must be 2-15 lowercase letters only (`/^[a-z]{2,15}$/`)
- `normalizeName(name: string)` → `name.toLowerCase()` (case-insensitive matching)

#### 4. Session Store (`src/session/store.ts`)

JSON file at `~/.sandctl/sessions.json`. Implement:

- `add(session: Session)` — append to store, reject duplicates
- `update(id: string, updates: Partial<Session>)` — merge updates
- `remove(id: string)` — delete by ID
- `get(id: string)` — case-insensitive lookup, throw `NotFoundError` if missing
- `list()` — return all sessions
- `listActive()` — return only provisioning/running sessions

All operations:
- Read file → parse JSON → modify → write back
- Case-insensitive ID matching throughout
- Handle empty/missing file gracefully (return empty array)

#### 5. Unit Tests (`tests/unit/session/`)

**`tests/unit/session/id.test.ts`**:
- Generated IDs are 2-15 lowercase letters
- `validateID` accepts valid names ("alice", "bob")
- `validateID` rejects: uppercase ("Alice"), numbers ("abc123"), too short ("a"), too long (16+ chars)
- `normalizeName` lowercases input

**`tests/unit/session/names.test.ts`**:
- Name pool has exactly 250 entries
- All names match `validateID` format
- `getRandomName` avoids collisions
- `getRandomName` throws when all names are in use
- Random selection is not deterministic (run 10 times, get >1 unique name)

**`tests/unit/session/store.test.ts`**:
- `add` persists to JSON file
- `add` rejects duplicate IDs
- `get` is case-insensitive ("Alice" finds "alice")
- `get` throws `NotFoundError` for missing sessions
- `remove` deletes session from file
- `update` merges partial updates
- `list` returns all sessions
- `listActive` filters to provisioning + running only
- Empty file returns empty array
- Missing file returns empty array

**`tests/unit/session/types.test.ts`**:
- `isActive` returns true for "provisioning" and "running"
- `isTerminal` returns true for "stopped" and "failed"
- `timeoutRemaining` calculates correctly for active timeouts
- `timeoutRemaining` returns null when no timeout set
- Duration serialization matches Go format ("1h0m0s")

### How to Verify

```bash
# Run all session tests
bun test tests/unit/session/

# Verify name pool matches Go source exactly
# Compare count: must be 250
bun -e "import { names } from './src/session/names.ts'; console.log(names.length)"
# Output: 250

# Verify JSON compatibility with Go format
cat > /tmp/test-sessions.json << 'EOF'
[{"id":"alice","status":"running","provider":"hetzner","provider_id":"12345","ip_address":"1.2.3.4","created_at":"2026-02-20T00:00:00Z","timeout":"1h0m0s"}]
EOF
# Store should be able to load this file

# Type check
bun run lint
```

### Constitution Compliance

- **I. Code Quality**: Each file has single responsibility (types, store, names, ID)
- **I. Type Safety**: `Status` is a union type, not a loose string; `Session` fields are strongly typed
- **III. Input Validation**: ID validation enforces strict format; store rejects duplicates
- **V. E2E Testing**: Store tests are unit tests accessing internal state — this is correct for unit tests. E2E tests (PR-16) will only use CLI commands.

---

## PR-06: List + Destroy Commands (Tasks T055–T057, T060–T062)

**Blocked by**: PR-03 (session), PR-10 (provider — for list sync and destroy)
**Blocks**: PR-16 (E2E)

### What to Build

#### 1. List Command (`src/commands/list.ts`)

Implement `sandctl list` (alias: `ls`):

1. Load sessions from store
2. If not `--all`, filter to active sessions only
3. For each session, sync status with provider API:
   - Get VM from provider → map VM status to session status
   - Update session in store if status changed
   - Handle provider errors gracefully (log warning, continue)
4. Handle legacy sessions (no provider_id) → mark as "(legacy)", status "stopped"
5. Display output:

**Table format** (default):
```
ID       PROVIDER  STATUS   CREATED              TIMEOUT
alice    hetzner   running  2026-02-20 10:30:00  2h remaining
bob      hetzner   stopped  2026-02-19 14:00:00  expired
```

**JSON format** (`-f json`): Pretty-printed JSON array of session objects.

**Empty state**: "No active sessions." + "Use 'sandctl new' to create one."

Timeout display logic:
- Has timeout, not expired → "Xh remaining" or "Xm remaining"
- Has timeout, expired → "expired"
- No timeout → "-"

**Flags**:
```
-f, --format <format>   Output format: table (default) or json
-a, --all               Include stopped and failed sessions
```

#### 2. Destroy Command (`src/commands/destroy.ts`)

Implement `sandctl destroy <name>` (aliases: `rm`, `delete`):

1. Normalize session name (case-insensitive)
2. Validate name format
3. Get session from store (friendly error if not found: suggest `sandctl list`)
4. Handle legacy sessions: print error, offer local-only removal with `--force`
5. If not `--force`: prompt for confirmation: "Destroy session '<name>'? This cannot be undone. [y/N]"
6. Get provider for session
7. Delete VM from provider (log warning if fails, continue with local cleanup)
8. Remove session from local store
9. Show success: "Session '<name>' destroyed."

**Flags**:
```
-f, --force   Skip confirmation prompt
```

**Aliases**: Register `rm` and `delete` as aliases for `destroy`.

#### 3. Error Handling

- Session not found → exit code 4, message: `[error] Session '<name>' not found. Use 'sandctl list' to see available sessions.`
- Provider deletion fails → warning logged, local cleanup continues
- Legacy session → specific error message about legacy format

### How to Verify

```bash
# List with no sessions
./sandctl list
# Output: "No active sessions.\nUse 'sandctl new' to create one."

# List with JSON format
./sandctl list -f json
# Output: "[]" (empty JSON array)

# Destroy non-existent session
./sandctl destroy nonexistent
# Output: "[error] Session 'nonexistent' not found..."
# Exit code: 4

# Destroy with force
./sandctl destroy alice --force
# Should skip confirmation

# Aliases work
./sandctl rm alice --force
./sandctl delete alice --force
# Same behavior as destroy

# Case-insensitive matching
./sandctl destroy Alice --force
# Should find session "alice"
```

### Constitution Compliance

- **I. Code Quality**: List and destroy are separate commands with clear responsibilities
- **III. Security**: Provider deletion failures don't leave orphaned local sessions
- **III. Input Validation**: Session name validated and normalized before lookup
- **IV. User Privacy**: Confirmation prompt protects against accidental destruction
- **V. E2E Testing**: These commands will be tested via CLI invocation in PR-16
