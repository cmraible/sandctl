# Data Model: E2E Test Suite Improvement

**Feature**: 008-e2e-test-suite
**Date**: 2026-01-24

## Overview

This feature is a test infrastructure improvement with no new data entities. The tests interact with existing sandctl data structures through CLI invocation.

## Test Artifacts (Transient)

These are not persistent data models but temporary structures used during test execution:

### Test Binary

- **Location**: Temp directory created by `os.MkdirTemp`
- **Lifecycle**: Created in `TestMain`, deleted after all tests complete
- **Purpose**: Compiled sandctl binary used to execute CLI commands

### Test Config File

- **Location**: `t.TempDir()` per test
- **Format**: YAML (same as production `~/.sandctl/config`)
- **Lifecycle**: Created per test, auto-cleaned by Go test framework
- **Contents**:
  ```yaml
  sprites_token: <from SPRITES_API_TOKEN env var>
  opencode_zen_key: <optional, from env var if present>
  ```

### Test Session

- **Naming**: `e2e-test-{random}-{timestamp}`
- **Lifecycle**: Created by `sandctl start`, destroyed by `sandctl destroy` or `t.Cleanup`
- **State**: Managed by Sprites API (external to test suite)

## Existing Entities (Read-Only)

The tests verify behavior of existing sandctl entities without modifying their structure:

| Entity | Location | Test Interaction |
|--------|----------|------------------|
| Config | `~/.sandctl/config` | Tests use isolated temp config via `--config` flag |
| Sessions | `~/.sandctl/sessions.json` | Tests verify session appears/disappears from list |
| Sprites | Fly.io Sprites API | Tests provision/destroy via CLI commands |

## No New Contracts

This feature does not introduce new APIs or contracts. Tests exercise existing sandctl CLI interface.
