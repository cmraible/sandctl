# Feature Specification: Sandbox Git Configuration

**Feature Branch**: `019-sandbox-git-config`
**Created**: 2026-01-27
**Status**: Draft
**Input**: User description: "Right now I can spin up a sandbox and have an AI agent work on a particular branch. However, my gitconfig file isn't present in the sandbox, so actually committing and pushing to a remote to ultimately create a PR doesn't work. The agent should be able to independently commit to a branch and create a pull request when it finishes its tasks."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent Makes Git Commits in Sandbox (Priority: P1)

A user spins up a sandbox with an AI agent to work on code changes. When the agent finishes its work, it needs to commit the changes with proper git author information. The agent should be able to run `git commit` without any additional configuration, using the user's name and email for the commit metadata.

**Why this priority**: Without git commit capability, the agent cannot persist any of its work to version control. This is the foundational capability that all other git operations depend on.

**Independent Test**: Can be fully tested by having an agent create a file and commit it in a sandbox. The commit should show the correct author name and email when running `git log`.

**Acceptance Scenarios**:

1. **Given** a new sandbox is created with git config enabled, **When** the agent runs `git commit -m "test"` after staging changes, **Then** the commit succeeds with the user's configured name and email as the author
2. **Given** a sandbox with git config enabled, **When** the agent runs `git log`, **Then** the configured user name and email appear in the commit author field
3. **Given** user has an existing `~/.gitconfig` on their local machine, **When** the user runs `sandctl init`, **Then** the system detects and offers to use the existing git name and email
4. **Given** no existing `~/.gitconfig` is found, **When** the user runs `sandctl init`, **Then** the user is prompted to optionally configure git name and email

---

### User Story 2 - Agent Pushes to Remote Repository (Priority: P2)

After committing changes, the AI agent needs to push the commits to the remote repository so the changes are available for pull request creation. The agent should be able to run `git push` and have it succeed using the user's SSH credentials that are already forwarded to the sandbox.

**Why this priority**: Pushing commits is required to create pull requests and share work. This builds on P1's commit capability and leverages the existing SSH agent forwarding.

**Independent Test**: Can be fully tested by having an agent commit a change and push it to a branch on the remote. The branch should appear on the remote repository with the new commit.

**Acceptance Scenarios**:

1. **Given** a sandbox with SSH agent forwarding enabled and git config present, **When** the agent runs `git push origin branch-name`, **Then** the push succeeds and the branch appears on the remote
2. **Given** SSH agent forwarding is not available, **When** the agent attempts to push, **Then** the operation fails with a clear error message about missing SSH credentials

---

### User Story 3 - Agent Creates Pull Request (Priority: P3)

Once changes are pushed, the AI agent should be able to create a pull request on GitHub using the GitHub CLI (`gh`). The agent needs authentication to the GitHub API to create PRs.

**Why this priority**: PR creation is the final step that delivers value to the user's workflow. It depends on P1 (commit) and P2 (push) being functional first.

**Independent Test**: Can be fully tested by having an agent push a branch and then run `gh pr create`. The PR should appear on GitHub with the correct title and description.

**Acceptance Scenarios**:

1. **Given** a sandbox with GitHub CLI authenticated and changes pushed to a branch, **When** the agent runs `gh pr create --title "Feature" --body "Description"`, **Then** a pull request is created on GitHub
2. **Given** GitHub authentication is configured via token, **When** the sandbox is created, **Then** the `gh` CLI is pre-authenticated and ready to use
3. **Given** GitHub token is not configured, **When** the user runs `sandctl init`, **Then** the user is prompted for their GitHub token (optional)

---

### Edge Cases

- What happens when the user has not configured git name/email? Sandbox creation proceeds with a warning; git commit operations will fail in the sandbox until user configures git manually.
- How does the system handle expired or invalid GitHub tokens? The agent receives a clear authentication error from `gh` CLI.
- What happens if SSH agent forwarding fails mid-session? Git push operations fail with a connection error; commits are preserved locally.
- What if the user has multiple git identities? The system uses the single configured identity; users needing multiple identities can override via git commands in the sandbox.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect user's existing `~/.gitconfig` on the local machine and offer to use it during `sandctl init`
- **FR-002**: System MUST allow users to manually configure git user name and email during `sandctl init` if no existing config is found or user declines to use it
- **FR-003**: System MUST store the path to the user's gitconfig file (or manually entered name/email) in the sandctl config file
- **FR-004**: System MUST copy the entire `~/.gitconfig` file to sandboxes when using existing config, preserving aliases, signing settings, and other customizations
- **FR-004b**: System MUST generate a minimal `~/.gitconfig` with only name/email when user manually enters values
- **FR-004a**: System SHOULD warn users during sandbox creation if git configuration is not set, but MUST NOT block sandbox creation
- **FR-005**: System MUST install GitHub CLI (`gh`) in new sandboxes
- **FR-006**: System SHOULD allow users to optionally configure a GitHub token during `sandctl init`
- **FR-007**: System MUST configure GitHub CLI authentication during cloud-init using `gh auth login --with-token` when a GitHub token is provided
- **FR-008**: System MUST use the `gh` CLI's built-in credential store for token storage (not plain text files)
- **FR-009**: System MUST validate git email format during configuration
- **FR-010**: System MUST display current git configuration when running `sandctl init` if already configured

### Key Entities

- **Git Configuration**: Either a path to user's existing `~/.gitconfig` file (copied in full to sandboxes) or manually entered name/email (used to generate minimal config)
- **GitHub Token**: Optional personal access token for GitHub API operations, stored securely in sandctl config and configured in sandbox via `gh auth login --with-token` during cloud-init

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agents can successfully run `git commit` in sandboxes without manual configuration
- **SC-002**: Agents can successfully run `git push` in sandboxes when SSH agent forwarding is enabled
- **SC-003**: Agents can successfully run `gh pr create` in sandboxes when GitHub token is configured
- **SC-004**: Users can configure git identity in under 1 minute during `sandctl init`
- **SC-005**: 100% of new sandboxes contain correct git global configuration when git name/email are configured

## Clarifications

### Session 2026-01-27

- Q: Should git configuration be mandatory or optional for sandbox creation? → A: Optional with warning; system should also detect and use user's existing ~/.gitconfig from local machine
- Q: How should the GitHub token be delivered to the sandbox? → A: Write to `gh` credential store during cloud-init using `gh auth login --with-token`
- Q: Should the system copy the entire .gitconfig or only name/email? → A: Copy entire ~/.gitconfig file to sandbox, preserving aliases, signing settings, and other customizations

## Assumptions

- SSH agent forwarding (added in feature #016) continues to work and provides authentication for git push operations
- Users have GitHub personal access tokens with appropriate scopes (repo, workflow) for PR creation
- The `agent` user in sandboxes (created by cloud-init) is the user that will run git operations
- GitHub CLI (`gh`) version available in Ubuntu 24.04 repositories supports `gh auth login --with-token` for credential store authentication
