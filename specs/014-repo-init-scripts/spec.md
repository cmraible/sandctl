# Feature Specification: Repository Initialization Scripts

**Feature Branch**: `014-repo-init-scripts`
**Created**: 2026-01-25
**Status**: Draft
**Input**: User description: "For each repository that I may run `sandctl new -R <repo>` with, I want to be able to define standard tools that should be installed, and possibly an init script that runs after cloning the repository. For example, for tryGhost/Ghost, I want to have docker pre-installed in the sprite, along with a particular version of node, yarn, playwright, etc, and I want to automatically run `yarn` inside the cloned repo to install all node dependencies. I need a way to configure this on a per-repo basis. One potential mvp implementation would be to provide a way for the user to specify an init.sh script that runs after cloning the repo and before starting the console session into the sprite."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure Repository with Init Script (Priority: P1)

As a developer, I want to create an initialization script for a specific GitHub repository so that when I create a new sprite with that repository cloned, my development environment is automatically set up with all required tools and dependencies.

**Why this priority**: This is the core MVP functionality. Without the ability to configure an init script for a repository, the feature provides no value.

**Independent Test**: Can be fully tested by running `sandctl repo add`, editing the created init.sh with custom commands, running `sandctl new -R <repo>`, and verifying the script executed successfully.

**Acceptance Scenarios**:

1. **Given** I have no existing configuration for `tryghost/ghost`, **When** I run `sandctl repo add` and enter `tryghost/ghost` when prompted, **Then** an init.sh template is created at `~/.sandctl/repos/tryghost-ghost/init.sh` and the path is displayed.

2. **Given** I have an init script configured for `tryghost/ghost` (with my custom commands added), **When** I run `sandctl new -R tryghost/ghost`, **Then** the sprite is created, the repository is cloned, and my init script runs automatically before the console session starts.

3. **Given** I have an init script configured for `tryghost/ghost`, **When** I run `sandctl new -R owner/different-repo` (a repo without configuration), **Then** the sprite is created and repository cloned normally without running any init script.

---

### User Story 2 - Manage Repository Configurations (Priority: P2)

As a developer, I want to list, view, update, and remove my repository configurations so that I can maintain my development environment setups over time.

**Why this priority**: After creating configurations (P1), users need to manage them. This enables ongoing maintenance but isn't required for initial use.

**Independent Test**: Can be fully tested by creating a configuration, then listing all configurations, viewing a specific one, editing it, and deleting it.

**Acceptance Scenarios**:

1. **Given** I have multiple repository configurations saved, **When** I run `sandctl repo list`, **Then** I see a list of all configured repositories.

2. **Given** I have a configuration for `tryghost/ghost`, **When** I run `sandctl repo show tryghost/ghost`, **Then** I see the init script content displayed in the terminal.

3. **Given** I have a configuration for `tryghost/ghost`, **When** I run `sandctl repo edit tryghost/ghost`, **Then** the init.sh file opens in my default text editor for modification.

4. **Given** I have a configuration for `tryghost/ghost`, **When** I run `sandctl repo remove tryghost/ghost`, **Then** the configuration directory is deleted and future `sandctl new -R tryghost/ghost` commands run without any custom initialization.

---

### User Story 3 - Init Script Error Handling (Priority: P3)

As a developer, I want clear feedback when my init script fails so that I can diagnose and fix issues without losing my work.

**Why this priority**: Error handling improves user experience but isn't required for the feature to function. Users can debug scripts manually initially.

**Independent Test**: Can be fully tested by configuring a script that intentionally fails, running `sandctl new -R <repo>`, and verifying error output and sprite state.

**Acceptance Scenarios**:

1. **Given** I have an init script that exits with a non-zero status, **When** I run `sandctl new -R <repo>`, **Then** I see the error output from the script and am informed the initialization failed.

2. **Given** my init script fails during execution, **When** the failure occurs, **Then** the command prints the error and exits without starting a console session, but the sprite remains available for manual debugging via `sandctl console <name>`.

---

### Edge Cases

- What happens when a user tries to add a repository that already has a configuration?
- How does the system handle repository names with different casing (e.g., `TryGhost/Ghost` vs `tryghost/ghost`)?
- What happens if the init script runs longer than expected (timeout scenario)?
- What happens if the user manually deletes the init.sh file but the directory remains?
- How are repository names with special characters (slashes, dots) normalized for directory names?
- What happens if the user's `$EDITOR` environment variable is not set?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to add a repository configuration via `sandctl repo add`, which prompts for the repository name or URL and creates an init.sh script template.
- **FR-002**: System MUST persist repository configurations and init scripts in a managed directory structure (`~/.sandctl/repos/<repo>/init.sh`).
- **FR-003**: System MUST execute the configured init script after cloning the repository and before starting the console session when running `sandctl new -R <repo>`.
- **FR-004**: System MUST perform case-insensitive matching on repository names (e.g., `TryGhost/Ghost` matches `tryghost/ghost`).
- **FR-005**: System MUST display init script output (stdout/stderr) to the user during execution.
- **FR-006**: System MUST report the exit status of the init script and clearly indicate success or failure.
- **FR-007**: System MUST allow users to list all configured repositories via `sandctl repo list`.
- **FR-008**: System MUST allow users to view the init script for a specific repository via `sandctl repo show <repo>`.
- **FR-009**: System MUST allow users to edit the init script via `sandctl repo edit <repo>`, opening the script in the user's default text editor.
- **FR-010**: System MUST allow users to remove a repository configuration via `sandctl repo remove <repo>`.
- **FR-011**: System MUST create a valid shell script template when adding a new repository, with helpful comments explaining usage.
- **FR-012**: System MUST NOT automatically destroy the sprite if the init script fails; system MUST print the error, exit without starting a console session, and display the sprite name so users can debug via `sandctl console <name>`.
- **FR-013**: System MUST support init script execution timeout with a configurable default (default: 10 minutes).
- **FR-014**: System MUST print the path to the created init.sh file after `sandctl repo add` so users know where to edit it.

### Key Entities

- **Repository Configuration**: A directory structure at `~/.sandctl/repos/<normalized-repo-name>/` containing the init script and any future configuration files for a specific GitHub repository.
- **Init Script**: A shell script file (`init.sh`) managed by sandctl within the repository configuration directory. Created from a template when the user runs `sandctl repo add`, edited manually by the user, and executed in the sprite after repository cloning.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can configure an init script for a repository and have it execute automatically in under 30 seconds of additional setup time (excluding script runtime).
- **SC-002**: Users can manage (list, view, update, remove) repository configurations through a consistent command interface.
- **SC-003**: 100% of configured init scripts execute successfully when the script itself has no errors.
- **SC-004**: Users receive clear error messages within 5 seconds when configuration operations fail (duplicate repo, missing configuration, etc.).
- **SC-005**: Repository matching works correctly regardless of case variations in user input.

## Clarifications

### Session 2026-01-25

- Q: What command interface design for managing repo configurations? → A: New subcommand group: `sandctl repo add/list/show/edit/remove <repo>`
- Q: Init script storage strategy? → A: System-managed scripts in `~/.sandctl/repos/<repo>/init.sh`; user edits manually
- Q: Behavior after init script failure? → A: Abort to prompt; print error and exit, user must manually run `sandctl console` to debug

## Assumptions

- Init scripts are shell scripts compatible with the sprite's shell environment (bash assumed).
- The init script is transferred from `~/.sandctl/repos/<repo>/init.sh` to the sprite before execution.
- The init script runs with the working directory set to the cloned repository root.
- Users have basic familiarity with shell scripting.
- The sprite environment has network access for scripts that need to download dependencies.
- Repository identifiers follow the standard GitHub `owner/repo` format.
- Users have a text editor configured via `$EDITOR` or `$VISUAL` environment variable (fallback: `vi`).
- Repository names are normalized to filesystem-safe directory names (e.g., `owner/repo` → `owner-repo`).
