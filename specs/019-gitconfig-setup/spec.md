# Feature Specification: Git Config Setup

**Feature Branch**: `001-gitconfig-setup`
**Created**: 2026-01-27
**Status**: Draft
**Input**: User description: "Inside the VM, there's currently no .gitconfig file, so the agent isn't able to commit without further input from me. When running sandctl init, it should prompt the user for how they want to handle gitconfig. The default choice should be to use their own ~/.gitconfig. They should also be able to provide a path to a different git config, or have sandctl create one for them after prompting for the necessary inputs (name and email)."

## Clarifications

### Session 2026-01-27

- Q: What happens when a user has no ~/.gitconfig file on their local machine and selects the default option? → A: Detect missing ~/.gitconfig before presenting options; disable/hide default option if not available
- Q: What happens when a user cancels or interrupts the Git config setup during sandctl init? → A: Git config setup is optional; user can skip and continue with sandctl init without Git configuration
- Q: What happens when the VM already has a .gitconfig file from a previous initialization? → A: Skip Git config transfer entirely if .gitconfig already exists (keep existing)
- Q: What file permissions should be set on the VM's .gitconfig file? → A: 0600 (read/write for owner only)
- Q: What happens when a user's ~/.gitconfig file is unreadable due to permissions issues? → A: Silently disable the default option without explanation

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Default Git Config Transfer (Priority: P1)

As a developer running `sandctl init`, I want to automatically use my existing local Git configuration in the VM so that commits I make inside the VM are properly attributed without any additional setup.

**Why this priority**: This is the most common scenario and provides the best user experience. Most developers already have a properly configured Git identity on their local machine and expect it to work seamlessly in development environments.

**Independent Test**: Can be fully tested by running `sandctl init`, accepting the default option, SSHing into the VM, and verifying that `git config --global user.name` and `git config --global user.email` return the same values as the local machine.

**Acceptance Scenarios**:

1. **Given** a user has a `~/.gitconfig` file on their local machine with name and email configured, **When** they run `sandctl init` and accept the default option, **Then** the VM contains a `.gitconfig` file with the same user.name and user.email values
2. **Given** a user selects the default Git config option during init, **When** the agent makes a commit inside the VM, **Then** the commit is attributed to the correct author without prompting for credentials
3. **Given** a user's local `~/.gitconfig` contains additional settings (aliases, core settings, etc.), **When** they choose the default option, **Then** all Git configuration is transferred to the VM

---

### User Story 2 - Custom Git Config Path (Priority: P2)

As a developer who maintains multiple Git identities for different projects, I want to specify a custom Git config file during `sandctl init` so that I can use the appropriate identity for this sandbox environment.

**Why this priority**: This is a less common but important scenario for developers who work with multiple Git identities (personal vs. work, different clients, etc.). It provides flexibility without complicating the default flow.

**Independent Test**: Can be fully tested by running `sandctl init`, selecting the custom path option, providing a path to an alternate `.gitconfig` file, and verifying the VM uses that configuration.

**Acceptance Scenarios**:

1. **Given** a user has multiple `.gitconfig` files on their local machine, **When** they run `sandctl init` and select the custom path option, **Then** they are prompted to enter a file path
2. **Given** a user provides a valid path to a custom Git config file, **When** the initialization completes, **Then** the VM contains a copy of that configuration
3. **Given** a user provides an invalid or non-existent path, **When** the system validates the path, **Then** they receive a clear error message and are prompted to enter a valid path or choose a different option

---

### User Story 3 - Generate New Git Config (Priority: P3)

As a developer setting up a new development identity or using a machine without existing Git configuration, I want to create a new Git config during `sandctl init` by providing my name and email so that my commits are properly attributed without needing to configure Git beforehand.

**Why this priority**: This is the least common scenario since most developers already have Git configured, but it's essential for completeness and for users on new machines or those wanting a fresh identity for sandbox work.

**Independent Test**: Can be fully tested by running `sandctl init`, selecting the "create new" option, entering name and email, and verifying the VM has a properly formatted `.gitconfig` with those values.

**Acceptance Scenarios**:

1. **Given** a user selects the option to create a new Git config, **When** prompted, **Then** they are asked to provide their full name
2. **Given** a user has entered their name, **When** prompted for email, **Then** they are asked to provide their email address
3. **Given** a user provides both name and email, **When** initialization completes, **Then** the VM contains a `.gitconfig` file with user.name and user.email set to the provided values
4. **Given** a user enters an invalid email format, **When** validating the input, **Then** they receive a clear error message and are prompted to re-enter a valid email

---

### Edge Cases

- **Unreadable ~/.gitconfig**: If the user's `~/.gitconfig` file exists but is unreadable due to permissions issues, silently disable/hide the default option and present only "custom path" and "create new" options
- **Cancellation/Skip**: Git config setup is optional; user can cancel or skip the setup entirely and continue with `sandctl init` without Git configuration in the VM
- **Missing ~/.gitconfig**: System detects before presenting options; if user's `~/.gitconfig` does not exist, the default option is disabled/hidden and user is presented only with "custom path" and "create new" options
- How does the system handle very large `.gitconfig` files (e.g., with many aliases and complex configurations)?
- What happens when a user provides a relative path vs. absolute path for a custom config file?
- **Existing VM .gitconfig**: If the VM already has a `.gitconfig` file, skip Git config transfer entirely and keep the existing configuration

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST prompt the user to choose a Git configuration method during `sandctl init`
- **FR-002**: System MUST check for the existence of `~/.gitconfig` before presenting options
- **FR-003**: System MUST present configuration options based on availability: use default config (from `~/.gitconfig`, only if file exists), use custom config file, create new config, or skip Git configuration
- **FR-004**: System MUST make the "use default config" option the default/recommended choice when `~/.gitconfig` exists
- **FR-005**: System MUST allow users to skip Git configuration entirely and continue with `sandctl init`
- **FR-006**: Users MUST be able to navigate and select options using keyboard input
- **FR-007**: System MUST validate that the user's `~/.gitconfig` is readable before presenting the default option; if unreadable, silently disable/hide the default option
- **FR-008**: System MUST prompt for a file path when the user selects the custom config file option
- **FR-009**: System MUST validate that the custom config file path exists and is readable
- **FR-010**: System MUST expand shell variables (like `~`) and relative paths to absolute paths when accepting file paths
- **FR-011**: System MUST prompt for user name (user.name) when the user selects the create new config option
- **FR-012**: System MUST prompt for user email (user.email) when the user selects the create new config option
- **FR-013**: System MUST validate that the email address has a basic valid format (contains @ and domain)
- **FR-014**: System MUST check if the VM already has a `.gitconfig` file for the agent user before attempting transfer
- **FR-015**: System MUST skip Git config transfer entirely if a `.gitconfig` file already exists in the VM, preserving the existing configuration
- **FR-016**: System MUST transfer the selected or created Git configuration to the VM at `~/.gitconfig` for the agent user only when no existing config is present (when user chooses a configuration option)
- **FR-017**: System MUST preserve all sections and settings when copying an existing config file
- **FR-018**: System MUST set file permissions to 0600 (read/write for owner only) on the VM's `.gitconfig` file
- **FR-019**: System MUST provide clear error messages if file reading, validation, or transfer fails
- **FR-020**: System MUST allow the user to retry or select a different option if an error occurs
- **FR-021**: System MUST continue with the rest of the `sandctl init` workflow regardless of whether user completes or skips Git config setup

### Key Entities

- **Git Configuration**: Represents the user's Git identity and preferences, containing at minimum user.name and user.email, potentially including aliases, core settings, and other Git configuration options
- **Agent User**: The non-root user account in the VM that will be making Git commits and requires proper Git configuration

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete Git config setup during `sandctl init` in under 30 seconds for the default option
- **SC-002**: 100% of users who complete Git config setup can successfully make commits in the VM without additional configuration
- **SC-003**: Users receive clear feedback within 2 seconds when providing invalid inputs (bad file path, invalid email)
- **SC-004**: The system successfully handles all three configuration methods (default, custom, create new) without errors
- **SC-005**: 95% of users successfully complete Git config setup on their first attempt without needing to retry

## Assumptions

- Users running `sandctl init` have the necessary permissions to read their local Git config files
- The VM has sufficient space and permissions to create a `.gitconfig` file in the agent user's home directory
- Users understand basic Git concepts and the importance of proper commit attribution
- The agent user account has already been created in the VM before Git config setup occurs
- The default location for Git config on the local machine is `~/.gitconfig` (standard on macOS and Linux)
- Email validation only needs to check for basic format correctness, not whether the email address actually exists
- Users have a terminal environment that supports standard input prompts for the `sandctl init` command
