/**
 * Contract test: legacy sessions.json format (object with sessions array,
 * missing provider/provider_id/ip_address) loads without error.
 *
 * The Go implementation stored sessions as `{ "sessions": [...] }` with
 * provider/provider_id/ip_address present.  Earlier versions may have omitted
 * those fields.  This test seeds a legacy file and asserts that:
 *   1. `list --all --format json` exits with code 0
 *   2. stdout contains the legacy session IDs
 *   3. stderr contains no raw JSON schema dump (Zod validation noise)
 *
 * The test is credential-free and deterministic — no real VMs are touched.
 * Sessions without a provider_id are treated as stopped by the list command.
 */

import { describe, expect, test } from "bun:test";

import {
	cleanupTempHome,
	makeTempHome,
	runBinary,
	writeConfigFixture,
	writeSessionsFixture,
} from "./helpers";

// Sentinel substrings that indicate raw Zod schema validation output leaked
// into stderr.  If any of these appear we know the store is rejecting or
// noisily logging the legacy file structure.
const SCHEMA_DUMP_SENTINELS = [
	// Zod v4 error format preamble
	"ZodError",
	// Zod issue path notation that appears in raw schema dumps
	'"issues"',
	// thrown by store.ts load() when fileSchema.safeParse fails (store.ts:87)
	"invalid sessions file structure",
	// generic parse failure from store.ts
	"failed to parse sessions file",
];

// A minimal legacy sessions.json fixture: the object-with-sessions-array
// format used by the Go implementation, with provider/provider_id/ip_address
// intentionally absent.
const LEGACY_SESSIONS_FIXTURE = JSON.stringify(
	{
		sessions: [
			{
				id: "legacy-alpha",
				status: "running",
				created_at: "2024-01-15T10:00:00.000Z",
			},
			{
				id: "legacy-beta",
				status: "stopped",
				created_at: "2024-01-14T08:30:00.000Z",
			},
		],
	},
	null,
	2,
);

describe("legacy sessions.json contract", () => {
	test("list --all --format json loads legacy object-envelope sessions without error", () => {
		const home = makeTempHome();
		try {
			writeConfigFixture(home);
			writeSessionsFixture(home, LEGACY_SESSIONS_FIXTURE);

			const result = runBinary(["list", "--all", "--format", "json"], {
				env: { HOME: home },
				timeoutMs: 5_000,
			});

			// Must exit cleanly — a non-zero exit means the store rejected the file
			expect(result.code).toBe(0);

			// stdout must be valid JSON array
			let parsed: unknown;
			expect(() => {
				parsed = JSON.parse(result.stdout);
			}).not.toThrow();
			expect(Array.isArray(parsed)).toBeTrue();

			// Both legacy session IDs must appear in stdout
			expect(result.stdout).toContain("legacy-alpha");
			expect(result.stdout).toContain("legacy-beta");

			// stderr must not contain raw schema validation dumps
			for (const sentinel of SCHEMA_DUMP_SENTINELS) {
				expect(result.stderr).not.toContain(sentinel);
			}
		} finally {
			cleanupTempHome(home);
		}
	});

	test("list --all --format json normalises missing provider fields to empty strings", () => {
		// Each test gets its own isolated temp home so store.update writes from
		// list (status normalisation) do not bleed into other tests' fixtures.
		const home = makeTempHome();
		try {
			writeConfigFixture(home);
			writeSessionsFixture(home, LEGACY_SESSIONS_FIXTURE);

			const result = runBinary(["list", "--all", "--format", "json"], {
				env: { HOME: home },
			});

			expect(result.code).toBe(0);

			const sessions = JSON.parse(result.stdout) as Array<{
				id: string;
				provider: string;
				provider_id: string;
				ip_address: string;
				status: string;
			}>;

			// Every session must have the required fields, normalised to empty
			// strings where the legacy file omitted them.
			for (const session of sessions) {
				expect(typeof session.provider).toBe("string");
				expect(typeof session.provider_id).toBe("string");
				expect(typeof session.ip_address).toBe("string");
			}

			// Sessions without a provider_id are auto-marked stopped by list.ts
			for (const session of sessions) {
				if (session.provider_id === "") {
					expect(session.status).toBe("stopped");
				}
			}
		} finally {
			cleanupTempHome(home);
		}
	});
});
