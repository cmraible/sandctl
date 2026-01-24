# Feature Specification: E2E Test Suite Improvement

**Feature Branch**: `008-e2e-test-suite`
**Created**: 2026-01-24
**Status**: Draft
**Input**: User description: "Let's improve our e2e test suite. The e2e tests should focus on the behavior of sandctl from the perspective of an end user. Any tests that do not directly call the sandctl commands should be removed, and we should have at least 1 e2e test for each sandctl command."

## Clarifications

### Session 2026-01-24

- Q: What should happen to existing e2e tests that call Sprites API directly? → A: Delete entirely (rely on unit tests in `internal/sprites/client_test.go`)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Verify Each Command Works End-to-End (Priority: P1)

As a developer maintaining sandctl, I want e2e tests that execute actual sandctl CLI commands so that I can verify the tool works correctly from an end user's perspective.

**Why this priority**: The core purpose of e2e tests is to validate the CLI works as users will actually use it. Without tests that invoke real commands, we cannot have confidence in the user experience.

**Independent Test**: Can be tested by running `go test -tags=e2e ./tests/e2e/...` and verifying each sandctl command (init, start, list, exec, destroy, version) is exercised through CLI invocation.

**Acceptance Scenarios**:

1. **Given** a clean environment, **When** running `sandctl init` with valid credentials, **Then** the configuration file is created at `~/.sandctl/config` with correct permissions
2. **Given** a configured sandctl, **When** running `sandctl start -p "test prompt"`, **Then** a new session is provisioned and its name is displayed
3. **Given** an active session exists, **When** running `sandctl list`, **Then** the session appears in the output with correct state
4. **Given** an active session exists, **When** running `sandctl exec <session> -c "echo hello"`, **Then** the command output "hello" is returned
5. **Given** an active session exists, **When** running `sandctl destroy <session>`, **Then** the session is terminated and removed
6. **Given** sandctl is installed, **When** running `sandctl version`, **Then** version information is displayed

---

### User Story 2 - Remove Non-CLI Tests from E2E Suite (Priority: P2)

As a developer, I want the e2e test suite to only contain tests that invoke sandctl commands directly, so that the e2e tests accurately represent user workflows and are clearly distinguished from unit/integration tests.

**Why this priority**: Clear separation of test types reduces confusion and ensures e2e tests serve their intended purpose of validating end-to-end user workflows.

**Independent Test**: Can be verified by reviewing all tests in `tests/e2e/` and confirming each test invokes sandctl commands via CLI execution (not direct API calls or function calls).

**Acceptance Scenarios**:

1. **Given** the e2e test directory, **When** reviewing test code, **Then** every test function executes sandctl commands using `exec.Command` or equivalent CLI invocation
2. **Given** tests that currently call Sprites API directly (without CLI), **When** cleanup occurs, **Then** those tests are deleted (unit tests provide sufficient API coverage)

---

### User Story 3 - Test Complete User Workflow (Priority: P2)

As a developer, I want an e2e test that exercises the complete user workflow from initialization through session cleanup, so that I can verify the full user journey works correctly.

**Why this priority**: Testing individual commands in isolation may miss integration issues. A full workflow test validates the entire user experience.

**Independent Test**: Can be tested by running a single test that executes init → start → list → exec → destroy in sequence and verifies each step succeeds.

**Acceptance Scenarios**:

1. **Given** a clean environment with valid credentials, **When** executing the full workflow (init, start, list, exec, destroy), **Then** each command succeeds and the session lifecycle completes correctly
2. **Given** a full workflow test, **When** any step fails, **Then** cleanup is performed to avoid leaving orphaned resources

---

### User Story 4 - Test Error Handling (Priority: P3)

As a developer, I want e2e tests that verify sandctl handles error conditions gracefully, so that users receive helpful feedback when something goes wrong.

**Why this priority**: Error handling is important for user experience but is secondary to verifying happy-path functionality works.

**Independent Test**: Can be tested by running commands with invalid inputs and verifying appropriate error messages are displayed.

**Acceptance Scenarios**:

1. **Given** no configuration exists, **When** running `sandctl start -p "test"`, **Then** an informative error message is displayed directing user to run `sandctl init`
2. **Given** a configured sandctl, **When** running `sandctl exec nonexistent-session`, **Then** an error message indicates the session was not found
3. **Given** a configured sandctl, **When** running `sandctl destroy nonexistent-session`, **Then** an error message indicates the session was not found

---

### Edge Cases

- What happens when a session times out during a test? (Tests should handle session expiration gracefully)
- How does the test suite handle concurrent test execution? (Sessions must have unique names to avoid conflicts)
- What happens when the Sprites API is unavailable? (Tests should skip gracefully or provide clear error messages)
- How are credentials handled in CI environments? (Tests require `SPRITES_API_TOKEN` environment variable)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: E2E test suite MUST include at least one test for each sandctl command: `init`, `start`, `list`, `exec`, `destroy`, `version`
- **FR-002**: All e2e tests MUST invoke sandctl commands through CLI execution (e.g., `exec.Command("sandctl", "start", ...)`)
- **FR-003**: Tests that call Sprites API directly (not through CLI) MUST be deleted from the e2e test directory (existing unit tests in `internal/sprites/client_test.go` provide sufficient API coverage)
- **FR-004**: E2E tests MUST clean up any resources (sessions, config files) created during test execution
- **FR-005**: E2E tests MUST use the `//go:build e2e` build tag to separate them from unit tests
- **FR-006**: E2E tests MUST be runnable in CI environments with the `SPRITES_API_TOKEN` environment variable
- **FR-007**: Each test MUST use unique session names to allow parallel test execution without conflicts
- **FR-008**: Test output MUST clearly indicate which sandctl command is being tested
- **FR-009**: The `sandctl version` test MUST NOT require external API access (it is a local-only command)
- **FR-010**: Test names MUST follow a simplified, human-readable format: `sandctl <command> > <what is being tested>`

### Test Naming Convention

Test names should be simple, descriptive strings that clearly identify:
1. The command being tested
2. What specific behavior or scenario is being verified

**Format**: `sandctl <command> > <short description>`

**Examples**:
- `sandctl start > requires the --prompt flag`
- `sandctl start > succeeds with --prompt flag`
- `sandctl list > shows active sessions`
- `sandctl list > returns empty when no sessions exist`
- `sandctl exec > runs command in session`
- `sandctl exec > fails for nonexistent session`
- `sandctl destroy > removes session`
- `sandctl destroy > fails for nonexistent session`
- `sandctl init > creates config file`
- `sandctl init > sets correct file permissions`
- `sandctl version > displays version information`
- `workflow > complete session lifecycle`

**Anti-patterns to avoid**:
- BDD-style names: `TestSprite_Lifecycle_GivenValidToken_ThenCreatesExecsDeletes`
- Function-style names: `TestExecCommand_WithRunningSprite`
- Overly technical names: `TestSpriteAPIClientIntegration`

### Key Entities

- **Test Session**: A sandbox session created during e2e testing, identified by a unique name with `e2e-` prefix
- **Test Configuration**: A sandctl config file created in a temporary directory during testing to avoid affecting user's real config
- **Sandctl Binary**: The compiled sandctl executable used by e2e tests, built before test execution

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of sandctl commands (init, start, list, exec, destroy, version) have at least one e2e test
- **SC-002**: 0 tests in `tests/e2e/` directory call Sprites API directly without going through sandctl CLI
- **SC-003**: E2E test suite completes successfully when `SPRITES_API_TOKEN` is provided
- **SC-004**: All e2e tests pass in CI pipeline on pull request validation
- **SC-005**: Test failures provide clear diagnostic output identifying which command failed and why
- **SC-006**: All test names follow the `sandctl <command> > <description>` format and are human-readable

## Assumptions

- The existing Sprites API client tests in `internal/sprites/client_test.go` will remain as unit tests (they are not e2e tests)
- The `SPRITES_API_TOKEN` environment variable will be available in CI environments for e2e test execution
- Test execution may incur costs for Sprites API usage during session provisioning
- The sandctl binary will be built before e2e tests run (standard Go test practice)
- Tests for `sandctl init` will use a temporary directory to avoid modifying the user's actual configuration
