# Feature Specification: Repository Clone on Sprite Creation

**Feature Branch**: `013-repo-clone`
**Created**: 2026-01-25
**Status**: Draft
**Input**: User description: "When creating a new sprite, I want to be able to specify a git repo (--repo or -R), which will be cloned into the sprite during provisioning. For example, if I run `sandctl new -R TryGhost/Ghost`, it should create a new sprite as it does currently, and clone the TryGhost/Ghost repo on Github into /home/sprite/Ghost."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clone GitHub Repository During Sprite Creation (Priority: P1)

A developer wants to start working on an existing GitHub project immediately after creating a sprite. Instead of manually cloning the repository after connecting to the console, they specify the repository when creating the sprite, and it's ready to use when they connect.

**Why this priority**: This is the core feature request. Without this, the feature has no value.

**Independent Test**: Can be tested by running `sandctl new -R owner/repo` and verifying the repository exists at `/home/sprite/repo` after connecting.

**Acceptance Scenarios**:

1. **Given** the user has a valid configuration, **When** they run `sandctl new -R TryGhost/Ghost`, **Then** a new sprite is created with the TryGhost/Ghost repository cloned to `/home/sprite/Ghost`
2. **Given** the user specifies a repository with `--repo owner/repo`, **When** provisioning completes, **Then** the repository is fully cloned (not shallow) and ready for development
3. **Given** the user specifies a repository, **When** the clone operation is in progress, **Then** the user sees a progress indicator showing "Cloning repository"

---

### User Story 2 - Create Sprite Without Repository (Priority: P2)

A developer wants to create a new sprite without specifying a repository, preserving the current default behavior where no repository is cloned.

**Why this priority**: Backward compatibility is essential for existing workflows and scripts.

**Independent Test**: Can be tested by running `sandctl new` without the -R flag and verifying the sprite works as before.

**Acceptance Scenarios**:

1. **Given** the user runs `sandctl new` without the `--repo` flag, **When** provisioning completes, **Then** the sprite is created with no repositories cloned (existing behavior preserved)
2. **Given** the user has scripts that use `sandctl new` without the `--repo` flag, **When** those scripts run, **Then** they continue to work without modification

---

### User Story 3 - Handle Clone Failures Gracefully (Priority: P3)

A developer specifies an invalid or inaccessible repository. The system should report the error clearly and decide whether to continue with sprite creation or abort.

**Why this priority**: Error handling is important for user experience but secondary to the happy path.

**Independent Test**: Can be tested by running `sandctl new -R invalid/nonexistent-repo` and verifying appropriate error handling.

**Acceptance Scenarios**:

1. **Given** the user specifies a non-existent repository, **When** the clone fails, **Then** the user sees a clear error message indicating the repository could not be found
2. **Given** the user specifies a private repository they don't have access to, **When** the clone fails, **Then** the user sees an error message about access permissions
3. **Given** a repository clone fails, **When** the sprite provisioning is otherwise complete, **Then** the sprite creation fails and is cleaned up (all-or-nothing approach)

---

### Edge Cases

- What happens when the repository name contains special characters? The system should validate repository format (owner/repo pattern) before attempting to clone.
- How does the system handle very large repositories that take a long time to clone? The clone operation has a 10-minute timeout; if exceeded, the operation fails with a clear timeout error and the sprite is cleaned up.
- What happens if the target directory already exists? Since sprites are freshly provisioned, this should not occur, but if it does, the clone will fail with a clear error.
- What if the user specifies a full GitHub URL instead of owner/repo shorthand? The system should accept both formats (e.g., `TryGhost/Ghost` and `https://github.com/TryGhost/Ghost`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept a `--repo` or `-R` flag on the `sandctl new` command that specifies a GitHub repository to clone
- **FR-002**: System MUST accept repository specification in shorthand format (`owner/repo`) and convert it to a full GitHub URL for cloning
- **FR-003**: System MUST accept repository specification as a full GitHub URL (`https://github.com/owner/repo` or `https://github.com/owner/repo.git`)
- **FR-004**: System MUST clone the specified repository to `/home/sprite/{repo-name}` where `{repo-name}` is the repository name (last component of the path)
- **FR-005**: System MUST display a progress step "Cloning repository" during the clone operation
- **FR-006**: System MUST fail the entire sprite creation if the repository clone fails (all-or-nothing approach)
- **FR-007**: System MUST preserve existing behavior when `--repo` flag is not specified (no repository is cloned)
- **FR-008**: System MUST validate the repository format before attempting to clone (must be either `owner/repo` or a valid GitHub URL)
- **FR-009**: System MUST provide clear error messages when clone fails, distinguishing between "repository not found" and "access denied" scenarios where possible
- **FR-010**: System MUST start the console session in the cloned repository directory (`/home/sprite/{repo-name}`) when a repository was specified
- **FR-011**: System MUST apply a 10-minute timeout to the repository clone operation and fail with a clear timeout error if exceeded

### Key Entities

- **Repository Specification**: User-provided repository reference, either in shorthand (`owner/repo`) or full URL format
- **Clone Target**: The destination path in the sprite where the repository will be cloned (`/home/sprite/{repo-name}`)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a sprite with a cloned repository using a single command in under 5 minutes for average-sized repositories
- **SC-002**: Repository is immediately accessible in the expected location when the user connects to the console
- **SC-003**: 100% of existing `sandctl new` invocations without the `--repo` flag continue to work identically
- **SC-004**: Error messages for clone failures clearly indicate the cause (not found, access denied, network error)

## Clarifications

### Session 2026-01-25

- Q: After cloning a repository, where should the console session start? → A: Start in the cloned repo directory (`/home/sprite/{repo-name}`)
- Q: What clone timeout is appropriate for repository cloning? → A: 10 minutes (accommodates large repos like monorepos)

## Assumptions

- GitHub repositories are public by default; private repository authentication is out of scope for this feature
- The sprite has `git` pre-installed and available in the PATH (verified in existing `installDevTools` step)
- Network connectivity to GitHub is available from the sprite
- The `/home/sprite` directory exists and is writable
