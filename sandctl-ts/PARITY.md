# TypeScript Core Workflow Parity

This document tracks parity between the Go CLI and the TypeScript CLI in `sandctl-ts`.

## Current Status

| Area | Status | Notes |
| --- | --- | --- |
| Core command set (`init`, `new`, `list`, `exec`, `console`, `destroy`, `version`) | ✅ Parity for core workflow | Implemented in `sandctl-ts/src/commands/` and covered by unit tests plus e2e smoke gating. |
| Session lifecycle (`new -> list -> exec -> destroy`) | ✅ Parity for default workflow | Covered by unit tests and opt-in live smoke flow in `tests/e2e/live-smoke.test.ts`. |
| SSH runtime behavior (agent/file key modes and console assumptions) | ✅ Parity checks in place | Unit coverage includes SSH agent behavior and macOS/runtime parity scenarios. |
| Local verification pipeline (`lint`, `unit`, `e2e`, `build`) | ✅ Passing | Commands are documented in `README.md` and used as default local checks. |
| Contract test coverage (config paths, CLI flag contracts, session schema) | ✅ Closed | Three deterministic contract tests run in CI without live infrastructure or secrets. |
| CI hardening (required PR checks, live smoke gating, fork-PR policy) | ✅ Closed | `ts-ci.yml` updated: `contract-tests` job added, `e2e` job fails on missing token, logs uploaded on failure. |
| Command logic extraction (`session-runtime` shared helper) | ✅ Closed | `src/commands/shared/session-runtime.ts` centralises SSH-wait/exec/console logic; unit-tested independently. |
| Error formatting layer | ✅ Closed | `src/errors/format.ts` provides a single `formatError` function with unit coverage. |

## Quality Gaps Closed (feat/ts-quality-gaps)

The following gaps identified in the quality review have been resolved:

- **Contract tests**: `tests/e2e/config-path-contract.test.ts`, `tests/e2e/init-new-agent-contract.test.ts`, and `tests/e2e/legacy-sessions-contract.test.ts` verify compiled-binary behaviour deterministically without live infrastructure.
- **CI pipeline**: `pull_request` trigger added to `ts-ci.yml`; `contract-tests` job runs after `build`; `e2e` job now requires `HETZNER_API_TOKEN` and uploads failure logs; fork PRs are explicitly unsupported.
- **Session-runtime refactor**: `new`, `exec`, and `console` commands share a common `waitForSSH`/`runSSH`/`openConsole` helper, reducing duplication and making the SSH-wait loop independently testable.
- **Error formatting**: `formatError` consolidates `unknown` error coercion into a single tested utility.
- **Test fixtures**: `tests/support/fixtures.ts` provides canonical mock objects (`makeSession`, `makeConfig`) reused across unit tests.
- **Live smoke hardening**: `tests/e2e/live-smoke.test.ts` adds SSH-wait polling, timeout enforcement, and structured cleanup teardown.

## Known Gaps

- Template management subcommands (`sandctl template add|list|show|edit|remove`) are available in Go but are not yet exposed in the TypeScript CLI command tree.
- Full cloud-provider behavior is intentionally opt-in in CI/local verification because live smoke requires external credentials and real Hetzner resources.
- The e2e version test requires a built `./sandctl` binary in `sandctl-ts`; without a built binary it is skipped by design.
