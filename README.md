# sandctl

A CLI tool for managing sandboxed AI web development agents.

sandctl provisions isolated VM environments on pluggable cloud providers. Hetzner Cloud, DigitalOcean, and GCP Compute Engine are currently supported.

## Prerequisites

- Bun 1.x

## Quick Start

```bash
bun install
bun run build
./sandctl --help
./sandctl version
```

Initialize a provider config:

```bash
./sandctl init --provider hetzner --hetzner-token <token> --ssh-agent
./sandctl init --provider digitalocean --digitalocean-token <token> --ssh-agent
./sandctl init --provider gcp --gcp-project <project-id> --gcp-credentials-file <service-account.json> --ssh-agent
```

For GCP, `--gcp-credentials-file` is optional when Application Default Credentials are configured in the environment.

Create a VM with the configured default provider, or override it per command:

```bash
./sandctl new
./sandctl new --provider digitalocean --size large
./sandctl new --provider gcp --region us-central1-a --size medium
```

## Build

```bash
bun install
bun run build
```

## Install

```bash
bun install
bun run build
```

Copy `./sandctl` somewhere on your `PATH`.

## Cross-compile

```bash
bun install
bun run build-all
```

If `~/.local/bin` is not already on your `PATH`, add it before using the installed binary.

## Verification

### Default local checks

```bash
bun run lint
bun test tests/unit/
bun run test:e2e:contracts
bun run test:e2e
bun run build
```

Notes:
- `test:e2e` runs `build` first, then all files under `tests/e2e/`. Live infrastructure checks in `live-smoke.test.ts` are skipped by default unless `SANDCTL_LIVE_SMOKE=1` is set with at least one provider token.

### Contract tests

Contract tests verify compiled-binary behaviour without live infrastructure or secrets. They cover:

- `tests/e2e/config-path-contract.test.ts` — config file path resolution and XDG/home-dir overrides
- `tests/e2e/init-new-agent-contract.test.ts` — `new`/`init` agent command flag contracts
- `tests/e2e/legacy-sessions-contract.test.ts` — backwards-compatible session file schema

Run all three together:

```bash
bun run test:e2e:contracts
```

Contract tests run in CI as the `contract-tests` job (deterministic, no secrets required) after the `build` job succeeds.

### Opt-in live smoke checks

To run the real cloud smoke flow (`new -> list -> exec -> destroy`), provide credentials and opt in. The suite runs once per configured provider token:

```bash
SANDCTL_LIVE_SMOKE=1 HETZNER_API_TOKEN=<token> bun test tests/e2e/live-smoke.test.ts
SANDCTL_LIVE_SMOKE=1 DIGITALOCEAN_API_TOKEN=<token> bun test tests/e2e/live-smoke.test.ts
SANDCTL_LIVE_SMOKE=1 HETZNER_API_TOKEN=<token> DIGITALOCEAN_API_TOKEN=<token> bun test tests/e2e/live-smoke.test.ts
```

### Required PR checks policy

- TypeScript CI is required on pull requests.
- Live smoke (`tests/e2e/live-smoke.test.ts`) runs as a provider matrix in CI, producing separate `e2e (hetzner)` and `e2e (digitalocean)` checks.
- Configure `HETZNER_API_TOKEN` and `DIGITALOCEAN_API_TOKEN` as repository secrets to exercise both providers in CI. Each matrix leg fails when its provider token is unavailable.
- Fork PRs are unsupported for this required check because repository secrets are unavailable, so the `e2e` job fails by design.

## SSH Runtime Parity Notes

- SSH agent discovery and console behavior are tested with injected runtime/platform data so parity checks stay OS-independent.
- Run `bun test tests/unit/ssh/macos-parity.test.ts` to validate macOS path/terminal assumptions without requiring macOS at runtime.
