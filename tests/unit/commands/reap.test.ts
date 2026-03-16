import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runReap } from "@/commands/reap";
import type { Provider, SSHKeyManager } from "@/provider/interface";
import { SessionStore } from "@/session/store";
import type { Session } from "@/session/types";
import { baseProviderConfig } from "../../support/fixtures";

describe("commands/reap", () => {
	let store: SessionStore;
	let logSpy: ReturnType<typeof spyOn>;
	let warnSpy: ReturnType<typeof spyOn>;

	function makeProvider(
		overrides: Partial<Provider & SSHKeyManager> = {},
	): Provider & SSHKeyManager {
		return {
			name: () => "hetzner",
			create: async () => {
				throw new Error("not implemented");
			},
			get: async () => {
				throw new Error("not implemented");
			},
			delete: async () => {},
			list: async () => [],
			waitReady: async () => {
				throw new Error("not implemented");
			},
			ensureSSHKey: async () => "1",
			...overrides,
		};
	}

	// A session created far in the past with a short timeout — already expired.
	const expiredSession: Session = {
		id: "expired",
		status: "running",
		provider: "hetzner",
		provider_id: "vm-100",
		ip_address: "1.2.3.4",
		created_at: "2020-01-01T00:00:00Z",
		timeout: "1h0m0s",
	};

	// A session with a very long timeout — still active.
	const activeSession: Session = {
		id: "active",
		status: "running",
		provider: "hetzner",
		provider_id: "vm-200",
		ip_address: "5.6.7.8",
		created_at: new Date().toISOString(),
		timeout: "999h0m0s",
	};

	// A session with no timeout — should not be reaped.
	const noTimeoutSession: Session = {
		id: "notimeout",
		status: "running",
		provider: "hetzner",
		provider_id: "vm-300",
		ip_address: "9.10.11.12",
		created_at: "2020-01-01T00:00:00Z",
	};

	beforeEach(async () => {
		const dir = await mkdtemp(join(tmpdir(), "sandctl-reap-test-"));
		store = new SessionStore(join(dir, "sessions.json"));
		logSpy = spyOn(console, "log").mockImplementation(() => {});
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
		warnSpy.mockRestore();
	});

	test("no expired sessions prints message and returns empty result", async () => {
		await store.add(activeSession);
		const result = await runReap({ dryRun: false }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => makeProvider(),
		});

		expect(result.reaped).toEqual([]);
		expect(result.failed).toEqual([]);
		expect(logSpy).toHaveBeenCalledWith("No expired sessions found.");
	});

	test("no sessions at all returns empty result", async () => {
		const result = await runReap({ dryRun: false }, store);
		expect(result.reaped).toEqual([]);
		expect(logSpy).toHaveBeenCalledWith("No expired sessions found.");
	});

	test("reaps expired session and removes from store", async () => {
		await store.add(expiredSession);
		const deleted: string[] = [];

		const result = await runReap({ dryRun: false }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () =>
				makeProvider({
					delete: async (id: string) => {
						deleted.push(id);
					},
				}),
		});

		expect(result.reaped).toEqual([{ id: "expired", provider_id: "vm-100" }]);
		expect(result.failed).toEqual([]);
		expect(deleted).toEqual(["vm-100"]);
		await expect(store.get("expired")).rejects.toBeDefined();
		expect(logSpy).toHaveBeenCalledWith("Reaped session 'expired'");
	});

	test("skips sessions without timeout", async () => {
		await store.add(noTimeoutSession);
		const result = await runReap({ dryRun: false }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => makeProvider(),
		});

		expect(result.reaped).toEqual([]);
		expect(logSpy).toHaveBeenCalledWith("No expired sessions found.");
		// Session should still exist
		expect(await store.get("notimeout")).toMatchObject({ id: "notimeout" });
	});

	test("skips non-expired sessions", async () => {
		await store.add(expiredSession);
		await store.add(activeSession);
		const deleted: string[] = [];

		const result = await runReap({ dryRun: false }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () =>
				makeProvider({
					delete: async (id: string) => {
						deleted.push(id);
					},
				}),
		});

		expect(result.reaped).toHaveLength(1);
		expect(result.reaped[0].id).toBe("expired");
		expect(deleted).toEqual(["vm-100"]);
		// Active session should still exist
		expect(await store.get("active")).toMatchObject({ id: "active" });
	});

	test("dry-run shows what would be reaped without destroying", async () => {
		await store.add(expiredSession);

		const result = await runReap({ dryRun: true }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => makeProvider(),
		});

		expect(result.reaped).toEqual([{ id: "expired", provider_id: "vm-100" }]);
		expect(result.dry_run).toBe(true);
		expect(logSpy).toHaveBeenCalledWith("Would reap session 'expired'");
		// Session should still exist
		expect(await store.get("expired")).toMatchObject({ id: "expired" });
	});

	test("provider deletion failure records error and preserves session", async () => {
		await store.add(expiredSession);

		const result = await runReap({ dryRun: false }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () =>
				makeProvider({
					delete: async () => {
						throw new Error("API unavailable");
					},
				}),
			resolveLegacyProvider: () => undefined,
		});

		expect(result.reaped).toEqual([]);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0].id).toBe("expired");
		expect(result.failed[0].error).toContain("API unavailable");
		// Session preserved for retry
		expect(await store.get("expired")).toMatchObject({ id: "expired" });
	});

	test("silent mode suppresses console output", async () => {
		await store.add(expiredSession);

		const result = await runReap({ dryRun: false, silent: true }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => makeProvider(),
		});

		expect(result.reaped).toHaveLength(1);
		expect(logSpy).not.toHaveBeenCalled();
	});

	test("json output contains structured result", async () => {
		await store.add(expiredSession);

		const result = await runReap({ dryRun: false, silent: true }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => makeProvider(),
		});

		expect(result).toEqual({
			reaped: [{ id: "expired", provider_id: "vm-100" }],
			failed: [],
			dry_run: false,
		});
	});

	test("multiple expired sessions are all reaped", async () => {
		const expired2: Session = {
			...expiredSession,
			id: "oldtwo",
			provider_id: "vm-101",
		};
		await store.add(expiredSession);
		await store.add(expired2);

		const deleted: string[] = [];
		const result = await runReap({ dryRun: false }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () =>
				makeProvider({
					delete: async (id: string) => {
						deleted.push(id);
					},
				}),
		});

		expect(result.reaped).toHaveLength(2);
		expect(deleted).toContain("vm-100");
		expect(deleted).toContain("vm-101");
	});

	test("stopped sessions are not considered for reaping", async () => {
		await store.add({ ...expiredSession, status: "stopped" });
		// listActive() won't return stopped sessions, so reap shouldn't find them
		const result = await runReap({ dryRun: false }, store);
		expect(result.reaped).toEqual([]);
	});
});
