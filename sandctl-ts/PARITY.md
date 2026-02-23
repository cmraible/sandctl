# TypeScript Core Workflow Parity

This document tracks parity between the Go CLI and the TypeScript CLI in `sandctl-ts`.

## Current Status

| Area | Status | Notes |
| --- | --- | --- |
| Core command set (`init`, `new`, `list`, `exec`, `console`, `destroy`, `version`) | ✅ Parity for core workflow | Implemented in `sandctl-ts/src/commands/` and covered by unit tests plus e2e smoke gating. |
| Session lifecycle (`new -> list -> exec -> destroy`) | ✅ Parity for default workflow | Covered by unit tests and opt-in live smoke flow in `tests/e2e/live-smoke.test.ts`. |
| SSH runtime behavior (agent/file key modes and console assumptions) | ✅ Parity checks in place | Unit coverage includes SSH agent behavior and macOS/runtime parity scenarios. |
| Local verification pipeline (`lint`, `unit`, `e2e`, `build`) | ✅ Passing | Commands are documented in `README.md` and used as default local checks. |

## Known Gaps

- Template management subcommands (`sandctl template add|list|show|edit|remove`) are available in Go but are not yet exposed in the TypeScript CLI command tree.
- Full cloud-provider behavior is intentionally opt-in in CI/local verification because live smoke requires external credentials and real Hetzner resources.
- The e2e version test requires a built `./sandctl` binary in `sandctl-ts`; without a built binary it is skipped by design.
