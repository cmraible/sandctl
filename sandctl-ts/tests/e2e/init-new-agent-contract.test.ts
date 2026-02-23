/**
 * Contract test: `init --ssh-agent` produces a config that `new` can load
 * without config-validation errors.
 *
 * The test is credential-free and deterministic — it does NOT provision a real
 * VM.  `new` is expected to fail, but the failure must come from a provider
 * auth / network layer, NOT from config validation.  Specifically, the error
 * message must NOT contain the sentinel strings that config.ts emits when the
 * SSH public-key fields are missing.
 */

import { describe, expect, test } from "bun:test";

import {
	cleanupTempHome,
	makeTempHome,
	runBinary,
	seedSshPublicKey,
} from "./helpers";

// Sentinel substrings that indicate a config-validation failure in the
// `new` command.  If any of these appear in the combined output we know
// the config written by `init` is invalid and the contract is broken.
//
// Each sentinel is keyed to the config.ts source line that produces it so
// future maintainers can trace validation errors back to their origin.
const CONFIG_VALIDATION_SENTINELS = [
	// config.ts:179 — getSSHPublicKey(), agent branch: no key found
	"ssh_public_key_inline or ssh_public_key is required",
	// config.ts:56  — ValidationError constructor prefix (any validate() throw)
	"config validation failed",
	// config.ts:126 — validate(): ssh_public_key missing when not agent mode
	"is required unless ssh_key_source",
	// config.ts:184 — getSSHPublicKey(), non-agent branch: ssh_public_key absent
	"ssh_public_key is required",
	// config.ts:109 — validate(): default_provider missing
	"default_provider is required",
];

describe("init --ssh-agent -> new contract", () => {
	test("config written by init --ssh-agent passes validation inside new", () => {
		const home = makeTempHome();
		try {
			// Step 1: seed ~/.ssh/id_ed25519.pub so the agent-mode key fallback works.
			seedSshPublicKey(home);

			// Step 2: run `init --ssh-agent` with a fake token.
			//   We use a fake token because we never want to hit the real API.
			const initResult = runBinary(
				["init", "--hetzner-token", "fake-token-contract-test", "--ssh-agent"],
				{ env: { HOME: home } },
			);

			expect(initResult.code).toBe(0);

			// Step 3: run `new` using the config that `init` just wrote.
			//   10 s timeout: with a fake token the Hetzner API rejects us fast
			//   (auth error), so we never need to wait for a network hang.
			const newResult = runBinary(["new"], {
				env: { HOME: home },
				timeoutMs: 10_000,
			});

			// `new` MUST fail (we have no valid credentials).
			// A null exit code means the process was killed (SIGTERM from timeout
			// or another signal) rather than exiting cleanly — that's also a
			// failure of this contract because the binary should reject the fake
			// token long before the timeout fires.
			if (newResult.code === null) {
				throw new Error(
					`'new' was killed by signal (timeout or SIGTERM) rather than exiting ` +
						`with an auth/network error. stdout: ${newResult.stdout} ` +
						`stderr: ${newResult.stderr}`,
				);
			}
			expect(newResult.code).not.toBe(0);

			const combinedOutput = `${newResult.stdout}\n${newResult.stderr}`;

			// The failure must NOT be a config-validation error.
			for (const sentinel of CONFIG_VALIDATION_SENTINELS) {
				expect(combinedOutput).not.toContain(sentinel);
			}
		} finally {
			cleanupTempHome(home);
		}
	}, 30_000);
});
