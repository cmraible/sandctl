# Feature Specification: Rename Repo Commands to Template

**Feature Branch**: `018-rename-repo-to-template`
**Created**: 2026-01-27
**Status**: Draft
**Input**: User description: "Rename sandctl repo commands to sandctl template with simplified unique string names instead of repo owner/name format, enabling more flexible multi-repo workflows"

## Clarifications

### Session 2026-01-27

- Q: How should the system handle backward compatibility with existing `~/.sandctl/repos/` configurations? → A: Hard cutover - remove `-R/--repo` flag entirely, only support `-T/--template` and `templates/` directory. No backward compatibility.
- Q: Should template deletion require explicit user confirmation? → A: Yes, prompt "Delete template 'Ghost'? [y/N]" before proceeding.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a New Template (Priority: P1)

A user wants to create an initialization template for a development environment. Instead of being tied to a specific GitHub repository, they can create a template with any unique name of their choosing and define a custom init script.

**Why this priority**: This is the core functionality - creating templates is the foundation of the entire feature. Without this, no other functionality works.

**Independent Test**: Can be fully tested by running `sandctl template add Ghost` and verifying the template directory is created with an init.sh file, then the user's editor opens for editing.

**Acceptance Scenarios**:

1. **Given** the user has sandctl configured, **When** they run `sandctl template add Ghost`, **Then** a template named "Ghost" is created at `~/.sandctl/templates/ghost/` with an init.sh file, and the user's default editor opens to edit the script.
2. **Given** the user has sandctl configured, **When** they run `sandctl template add my-fullstack-env`, **Then** a template named "my-fullstack-env" is created with a normalized directory name.
3. **Given** a template named "Ghost" already exists, **When** the user runs `sandctl template add Ghost`, **Then** an error message is displayed indicating the template already exists, with instructions to use `sandctl template edit Ghost`.

---

### User Story 2 - Use Template with sandctl new (Priority: P1)

A user wants to create a new sandbox session using a template. The template's init script runs during session creation.

**Why this priority**: This is the primary use case for templates - using them to initialize sessions.

**Independent Test**: Can be fully tested by creating a template with a simple init script, running `sandctl new --template Ghost`, and verifying the init script executed on the new VM.

**Acceptance Scenarios**:

1. **Given** a template named "Ghost" exists with a custom init script, **When** the user runs `sandctl new --template Ghost`, **Then** a new session is created and the template's init script is executed on the VM.
2. **Given** a template named "Ghost" exists, **When** the user runs `sandctl new -T Ghost` (short flag), **Then** the session is created using that template.
3. **Given** no template named "Ghost" exists, **When** the user runs `sandctl new --template Ghost`, **Then** an error message is displayed indicating the template does not exist.

---

### User Story 3 - List Templates (Priority: P2)

A user wants to see all their configured templates to remember what they have available.

**Why this priority**: Essential for discoverability - users need to see what templates exist before using them.

**Independent Test**: Can be fully tested by creating several templates, then running `sandctl template list` and verifying all templates appear in the output.

**Acceptance Scenarios**:

1. **Given** the user has templates named "Ghost", "React", and "my-api", **When** they run `sandctl template list`, **Then** all three templates are displayed with their names and creation dates.
2. **Given** the user has no templates configured, **When** they run `sandctl template list`, **Then** a message is displayed indicating no templates are configured.

---

### User Story 4 - Edit a Template (Priority: P2)

A user wants to modify an existing template's init script.

**Why this priority**: Users will frequently need to refine their init scripts after initial creation.

**Independent Test**: Can be fully tested by creating a template, then running `sandctl template edit Ghost` and verifying the editor opens with the init.sh file.

**Acceptance Scenarios**:

1. **Given** a template named "Ghost" exists, **When** the user runs `sandctl template edit Ghost`, **Then** the user's default editor opens the init.sh script for that template.
2. **Given** no template named "Ghost" exists, **When** the user runs `sandctl template edit Ghost`, **Then** an error message is displayed indicating the template does not exist.

---

### User Story 5 - Show Template Details (Priority: P3)

A user wants to view the contents of a template's init script without editing it.

**Why this priority**: Useful for quickly reviewing scripts, but users can also just edit to view.

**Independent Test**: Can be fully tested by creating a template with specific init script content, then running `sandctl template show Ghost` and verifying the script content is displayed.

**Acceptance Scenarios**:

1. **Given** a template named "Ghost" exists with an init script, **When** the user runs `sandctl template show Ghost`, **Then** the init script contents are displayed to stdout.

---

### User Story 6 - Remove a Template (Priority: P3)

A user wants to delete a template they no longer need.

**Why this priority**: Cleanup functionality is important but less frequently used than create/edit.

**Independent Test**: Can be fully tested by creating a template, running `sandctl template remove Ghost`, and verifying the template directory is deleted.

**Acceptance Scenarios**:

1. **Given** a template named "Ghost" exists, **When** the user runs `sandctl template remove Ghost`, **Then** a confirmation prompt "Delete template 'Ghost'? [y/N]" is displayed.
2. **Given** the user confirms deletion with "y", **When** the prompt is answered, **Then** the template is deleted and a success message is displayed.
3. **Given** the user declines deletion with "N" or empty input, **When** the prompt is answered, **Then** the template is not deleted and an "Aborted" message is displayed.
4. **Given** no template named "Ghost" exists, **When** the user runs `sandctl template remove Ghost`, **Then** an error message is displayed indicating the template does not exist.

---

### Edge Cases

- What happens when a user provides a template name with special characters or spaces?
  - Names should be normalized (lowercase, replace spaces/special chars with hyphens)
- What happens when a user provides an empty template name?
  - An error should be displayed indicating a name is required
- What happens when the user's EDITOR environment variable is not set?
  - Fall back to common defaults (vi, nano) or display an error with instructions
- What happens to existing repo configurations?
  - This is a breaking change: existing `~/.sandctl/repos/` configurations will no longer work. Users must manually recreate them as templates in `~/.sandctl/templates/`
- What happens when running `sandctl template remove` in non-interactive mode (e.g., piped input)?
  - Error with message requiring interactive terminal for confirmation, or provide a `--force/-f` flag to bypass

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST rename the `repo` command group to `template`
- **FR-002**: System MUST change the `-R/--repo` flag on `sandctl new` to `-T/--template`
- **FR-003**: System MUST accept a simple unique string name for templates instead of owner/repo format
- **FR-004**: System MUST store templates at `~/.sandctl/templates/<normalized-name>/`
- **FR-005**: System MUST normalize template names to lowercase with special characters replaced by hyphens
- **FR-006**: System MUST open the user's editor immediately after creating a template to edit the init.sh script
- **FR-007**: System MUST completely remove the old `repo` command group and `-R/--repo` flag (breaking change, no backward compatibility)
- **FR-008**: System MUST delete the old `internal/repoconfig` package and related code
- **FR-009**: Template `add` command MUST accept the template name as a positional argument (e.g., `sandctl template add Ghost`)
- **FR-010**: Template names MUST be case-insensitive for lookups (Ghost, ghost, GHOST all refer to same template)
- **FR-011**: System MUST remove the repo parsing/validation logic that requires owner/repo format
- **FR-012**: System MUST generate a minimal starter init.sh script for new templates
- **FR-013**: System MUST prompt for confirmation before deleting a template ("Delete template '<name>'? [y/N]")
- **FR-014**: System MUST default to "No" if the user presses Enter without input at the deletion prompt

### Key Entities

- **Template**: A named initialization configuration containing an init.sh script and metadata (name, creation date, timeout settings)
- **Template Store**: Local storage at `~/.sandctl/templates/` managing template configurations

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a new template and have their editor open in under 5 seconds
- **SC-002**: Users can use templates to initialize sessions with multiple repositories or custom environments
- **SC-003**: All old repo-related code is removed, resulting in a cleaner codebase with no legacy paths
- **SC-004**: 100% of current repo command functionality is preserved under the new template commands
- **SC-005**: Users can complete the full workflow (create template, edit script, use with new session) without consulting documentation
