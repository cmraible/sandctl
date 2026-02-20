# Engineer 4 — UI Module & Template Commands

**Stream**: D
**PRs**: PR-04, PR-07

## Ownership

You own all user-facing output formatting and the template management system:

| Module | Files |
|--------|-------|
| Error formatting | `src/ui/errors.ts` |
| Progress/spinners | `src/ui/progress.ts` |
| Table formatting | `src/ui/table.ts` |
| Interactive prompts | `src/ui/prompt.ts` |
| Template store | Inline in `src/commands/template/` or a shared `src/templateconfig/` |
| Template commands | `src/commands/template/index.ts`, `add.ts`, `list.ts`, `show.ts`, `edit.ts`, `remove.ts` |
| Unit tests | `tests/unit/ui/` |

---

## PR-04: UI Module (Tasks T024–T028)

**Blocked by**: PR-01 (scaffold)
**Blocks**: PR-05 (init — needs prompts), PR-06 (list — needs tables), PR-07 (templates — needs prompts + tables), PR-13 (new — needs spinners)

### What to Build

#### 1. Error Formatting (`src/ui/errors.ts`)

Map error types to exit codes and user-friendly messages:

```typescript
// Exit codes (must match Go version)
export const ExitSuccess = 0;
export const ExitConfigError = 2;
export const ExitAPIError = 3;
export const ExitSessionNotFound = 4;
export const ExitSessionNotReady = 5;
```

Implement `formatError(error: Error)`:
- `NotFoundError` (config) → exit 2, message: `[error] Config not found at <path>. Run 'sandctl init' to create one.`
- `InsecurePermissionsError` → exit 2, message: `[error] Config file has insecure permissions...`
- `ValidationError` → exit 2, message: `[error] Invalid configuration: <details>`
- `NotFoundError` (session) → exit 4, message: `[error] Session '<name>' not found. Use 'sandctl list' to see available sessions.`
- `ErrAuthFailed` (provider) → exit 3, message: `[error] Authentication failed...`
- Generic errors → exit 1, message: `[error] <message>`

All error messages:
- Prefixed with `[error]`
- Include helpful next-step suggestions
- Printed to stderr

#### 2. Progress & Spinners (`src/ui/progress.ts`)

Wrapper around `ora` spinner library:

```typescript
class Spinner {
  start(message: string): void;
  update(message: string): void;
  success(message: string): void;
  fail(message: string): void;
}
```

Multi-step progress:

```typescript
interface ProgressStep {
  action: () => Promise<void>;
  message: string;
}

async function runSteps(steps: ProgressStep[]): Promise<void>;
// Runs each step sequentially with spinner, stops on first failure
```

Print helpers:

```typescript
function printSuccess(message: string): void;   // Green ✓ prefix
function printError(message: string): void;      // Red ✗ prefix
function printWarning(message: string): void;    // Yellow ⚠ prefix
function printInfo(message: string): void;       // Blue ℹ prefix
```

#### 3. Table Formatting (`src/ui/table.ts`)

Implement table display with column alignment:

```typescript
class Table {
  constructor(headers: string[]);
  addRow(values: string[]): void;
  toString(): string;  // Formatted table with 2-space column separators
}
```

Requirements:
- Column widths auto-calculated from content
- 2-space separator between columns (matching Go implementation)
- Headers in uppercase
- Left-aligned text
- Unicode-safe (handles multi-byte characters)

Example output:
```
ID       PROVIDER  STATUS   CREATED              TIMEOUT
alice    hetzner   running  2026-02-20 10:30:00  2h remaining
bob      hetzner   stopped  2026-02-19 14:00:00  -
```

#### 4. Interactive Prompts (`src/ui/prompt.ts`)

Wrapper around `@inquirer/prompts`:

```typescript
async function promptString(message: string, defaultValue?: string): Promise<string>;
async function promptSecret(message: string): Promise<string>;  // Masked input
async function promptSelect(message: string, choices: string[], defaultValue?: string): Promise<string>;
async function promptYesNo(message: string, defaultValue?: boolean): Promise<boolean>;
```

TTY detection: check `process.stdin.isTTY` before prompting. If not a TTY, throw an error suggesting non-interactive flags.

#### 5. Unit Tests (`tests/unit/ui/`)

**`tests/unit/ui/errors.test.ts`**:
- Config `NotFoundError` → exit code 2
- Session `NotFoundError` → exit code 4
- `InsecurePermissionsError` → exit code 2
- `ValidationError` → exit code 2
- `ErrAuthFailed` → exit code 3
- Generic `Error` → exit code 1
- All messages start with `[error]`
- Messages include helpful suggestions

**`tests/unit/ui/table.test.ts`**:
- Single row table formats correctly
- Multi-row table aligns columns
- Column widths adapt to content
- 2-space separator between columns
- Empty table returns headers only
- Unicode characters don't break alignment

**`tests/unit/ui/progress.test.ts`**:
- `printSuccess` outputs with green checkmark
- `printError` outputs with red cross
- `printWarning` outputs with yellow warning
- `printInfo` outputs with blue info symbol

### How to Verify

```bash
# Run UI tests
bun test tests/unit/ui/

# Manual table test — create a quick script
bun -e "
import { Table } from './src/ui/table.ts';
const t = new Table(['ID', 'STATUS', 'CREATED']);
t.addRow(['alice', 'running', '2026-02-20 10:30:00']);
t.addRow(['bob', 'stopped', '2026-02-19 14:00:00']);
console.log(t.toString());
"
# Verify columns align with 2-space separators

# Verify exit codes
bun -e "
import { formatError } from './src/ui/errors.ts';
// Test that NotFoundError returns code 2
"

# Lint passes
bun run lint
```

### Constitution Compliance

- **I. Code Quality**: Each UI component in its own file; clear function signatures
- **I. Type Safety**: Strongly typed — `ProgressStep` interface, exit code constants
- **III. Secrets Management**: `promptSecret` masks input — verify no echo to terminal
- **IV. Transparency**: Error messages clearly explain what went wrong and what to do next

---

## PR-07: Template Store + Commands (Tasks T063–T069)

**Blocked by**: PR-03 (session store patterns), PR-04 (UI — prompts + tables)
**Blocks**: PR-16 (E2E templates)

### What to Build

#### 1. Template Types & Store

Define types (see `data-model.md`):

```typescript
interface TemplateConfig {
  template: string;         // Normalized name (e.g., "my-api")
  original_name: string;    // Original name (e.g., "My API")
  created_at: string;       // ISO 8601
  timeout?: string;         // Default timeout
}
```

Name normalization: `"My API Template"` → `"my-api-template"` (lowercase, spaces/special chars to hyphens).

Store at `~/.sandctl/templates/<normalized-name>/`:
```
~/.sandctl/templates/my-api/
├── config.yaml      # TemplateConfig
└── init.sh          # Initialization script (0755)
```

Implement store operations:
- `add(name: string)` → create dir, write config.yaml, generate init.sh stub
- `get(name: string)` → load config by normalized name
- `list()` → return all template configs
- `remove(name: string)` → delete template directory
- `getInitScript(name: string)` → read init.sh content
- `getInitScriptPath(name: string)` → return path to init.sh

Custom errors: `NotFoundError`, `AlreadyExistsError`.

#### 2. Template Parent Command (`src/commands/template/index.ts`)

Register subcommands: add, list, show, edit, remove.

#### 3. Template Add (`src/commands/template/add.ts`)

`sandctl template add <name>`:

1. Normalize name
2. Check if template exists → error: "Template '<name>' already exists. Use 'sandctl template edit <name>' to modify it."
3. Create template directory + config.yaml + init.sh stub
4. Detect editor: `EDITOR` → `VISUAL` → `vim` → `vi` → `nano`
5. Open init.sh in editor
6. Print: "Template '<name>' is ready. Use 'sandctl new -T <name>' to create a session."

If no editor found: print warning with path to manually edit.

#### 4. Template List (`src/commands/template/list.ts`)

`sandctl template list`:

Table format:
```
NAME      CREATED
my-api    2026-02-20 10:30:00
backend   2026-02-19 14:00:00
```

Empty state: "No templates configured." + "Create one with: sandctl template add <name>"

#### 5. Template Show (`src/commands/template/show.ts`)

`sandctl template show <name>`:

Print init script content to stdout (raw, no formatting). Error if not found: "template '<name>' not found. Use 'sandctl template list' to see available templates"

#### 6. Template Edit (`src/commands/template/edit.ts`)

`sandctl template edit <name>`:

Open init.sh in detected editor. Same editor detection as add. Errors:
- Not found: "template '<name>' not found. Use 'sandctl template list' to see available templates"
- No editor: "no editor found. Set the EDITOR environment variable"

#### 7. Template Remove (`src/commands/template/remove.ts`)

`sandctl template remove <name>`:

1. Verify template exists
2. If not `--force`: prompt "Delete template '<name>'? [y/N]" (requires TTY)
3. Delete template directory
4. Print: "Template '<name>' deleted."

Errors:
- Not found: "template '<name>' not found..."
- Not interactive without `--force`: "confirmation required. Run in interactive terminal or use --force flag"

### How to Verify

```bash
# Template CRUD lifecycle
./sandctl template add test-template
# Should create ~/.sandctl/templates/test-template/ and open editor

./sandctl template list
# Should show "test-template" in table

./sandctl template show test-template
# Should print init.sh content

./sandctl template edit test-template
# Should open editor

./sandctl template remove test-template --force
# Should delete template

# Error cases
./sandctl template show nonexistent
# Error: "template 'nonexistent' not found..."

./sandctl template add test-template
./sandctl template add test-template
# Error: "Template 'test-template' already exists..."

# Name normalization
./sandctl template add "My API"
ls ~/.sandctl/templates/my-api/  # Normalized name
./sandctl template show "My API"  # Works with original name

# Verify init.sh is executable
stat -c '%a' ~/.sandctl/templates/test-template/init.sh  # Linux: should be 755
# macOS: stat -f '%Lp' ~/.sandctl/templates/test-template/init.sh
```

### Constitution Compliance

- **I. Code Quality**: Each subcommand in its own file; store logic separate from CLI
- **III. Security**: Template scripts have correct permissions (0755)
- **IV. User Privacy**: Confirmation before deletion; no data collected beyond template content
- **IV. User Control**: Users can add, view, edit, and delete their templates freely
