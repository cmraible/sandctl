import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runReap } from "@/commands/reap";
import type { Provider, SSHKeyManager } from "@/provider/interface";
import { SessionStore } from "@/session/store";
import type { Session } from "@/session/types";
import { baseProviderConfig } from "../../support/fixtures";

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "alice",
		status: "running",
		provider: "hetzner",
		provider_id: "vm-123",
		ip_address: "203.0.113.10",
		created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
		timeout: "1h0m0s",
		...overrides,
	};
}

function makeProvider(
	deleteFn: (id: string) => Promise<void> = async () => {},
): Provider & SSHKeyManager {
	return {
		name: () => "hetzner",
		create: async () => {
			throw new Error("not implemented");
		},
		get: async () => {
			throw new Error("not implemented");
		},
		delete: deleteFn,
		list: async () => [],
		waitReady: async () => {
			throw new Error("not implemented");
		},
		ensureSSHKey: async () => "1",
	};
}

describe("commands/reap", () => {
	let store: SessionStore;
	let logSpy: ReturnType<typeof spyOn>;
	let warnSpy: ReturnType<typeof spyOn>;

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

	test("returns empty array when no sessions exist", async () => {
		const results = await runReap({ dryRun: false }, { store });
		expect(results).toEqual([]);
	});

	test("ignores sessions without a timeout", async () => {
		await store.add(makeSession({ timeout: undefined }));
		const results = await runReap({ dryRun: false }, { store });
		expect(results).toEqual([]);
	});

	test("ignores sessions whose timeout has not expired", async () => {
		await store.add(
			makeSession({
				created_at: new Date().toISOString(), // just created
				timeout: "1h0m0s",
			}),
		);
		const results = await runReap({ dryRun: false }, { store });
		expect(results).toEqual([]);
	});

	test("ignores stopped sessions even if expired", async () => {
		await store.add(makeSession({ status: "stopped" }));
		const results = await runReap({ dryRun: false }, { store });
		expect(results).toEqual([]);
	});

	test("ignores failed sessions even if expired", async () => {
		await store.add(makeSession({ status: "failed" }));
		const results = await runReap({ dryRun: false }, { store });
		expect(results).toEqual([]);
	});

	test("reaps expired active session", async () => {
		await store.add(makeSession());
		const deleted: string[] = [];
		const provider = makeProvider(async (id) => {
			deleted.push(id);
		});

		const results = await runReap(
			{ dryRun: false },
			{
				store,
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
			},
		);

		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("alice");
		expect(results[0].destroyed).toBe(true);
		expect(results[0].error).toBeUndefined();
		expect(deleted).toEqual(["vm-123"]);
		await expect(store.get("alice")).rejects.toBeDefined();
	});

	test("reaps provisioning sessions with expired timeout", async () => {
		await store.add(makeSession({ status: "provisioning" }));
		const provider = makeProvider();

		const results = await runReap(
			{ dryRun: false },
			{
				store,
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
			},
		);

		expect(results).toHaveLength(1);
		expect(results[0].destroyed).toBe(true);
	});

	test("dry-run does not destroy sessions", async () => {
		await store.add(makeSession());
		const deleted: string[] = [];
		const provider = makeProvider(async (id) => {
			deleted.push(id);
		});

		const results = await runReap(
			{ dryRun: true },
			{
				store,
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
			},
		);

		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("alice");
		expect(results[0].destroyed).toBe(false);
		expect(results[0].error).toBeUndefined();
		expect(deleted).toEqual([]);
		// Session should still exist
		expect(await store.get("alice")).toMatchObject({ id: "alice" });
	});

	test("continues reaping other sessions when one fails", async () => {
		await store.add(makeSession({ id: "alice", provider_id: "vm-fail" }));
		await store.add(makeSession({ id: "bob", provider_id: "vm-ok" }));

		const provider = makeProvider(async (id) => {
			if (id === "vm-fail") {
				throw new Error("cloud API error");
			}
		});

		const results = await runReap(
			{ dryRun: false },
			{
				store,
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
			},
		);

		expect(results).toHaveLength(2);

		const aliceResult = results.find((r) => r.id === "alice");
		const bobResult = results.find((r) => r.id === "bob");

		expect(aliceResult?.destroyed).toBe(false);
		expect(aliceResult?.error).toBeDefined();

		expect(bobResult?.destroyed).toBe(true);
		expect(bobResult?.error).toBeUndefined();

		// alice should still exist, bob should be removed
		expect(await store.get("alice")).toMatchObject({ id: "alice" });
		await expect(store.get("bob")).rejects.toBeDefined();
	});

	test("result includes age, timeout, and past_expiry fields", async () => {
		await store.add(makeSession());
		const provider = makeProvider();

		const results = await runReap(
			{ dryRun: true },
			{
				store,
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
			},
		);

		expect(results).toHaveLength(1);
		expect(results[0].age).toMatch(/^\d+[dhms]/);
		expect(results[0].timeout).toBe("1h0m0s");
		expect(results[0].past_expiry).toMatch(/^\d+[dhms]/);
		expect(results[0].provider).toBe("hetzner");
	});

	test("reaps legacy sessions without provider_id using force removal", async () => {
		await store.add(
			makeSession({
				id: "legacy",
				provider: "",
				provider_id: "",
			}),
		);

		const results = await runReap({ dryRun: false }, { store });

		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("legacy");
		expect(results[0].destroyed).toBe(true);
		await expect(store.get("legacy")).rejects.toBeDefined();
	});

	test("reaps multiple expired sessions", async () => {
		await store.add(makeSession({ id: "alice", provider_id: "vm-1" }));
		await store.add(makeSession({ id: "bob", provider_id: "vm-2" }));
		await store.add(
			makeSession({
				id: "carol",
				created_at: new Date().toISOString(),
				timeout: "1h0m0s",
			}),
		);

		const provider = makeProvider();

		const results = await runReap(
			{ dryRun: false },
			{
				store,
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
			},
		);

		// alice and bob are expired, carol is not
		expect(results).toHaveLength(2);
		expect(results.map((r) => r.id).sort()).toEqual(["alice", "bob"]);
	});

	test("custom log and warn functions are used", async () => {
		await store.add(makeSession());
		const logs: string[] = [];
		const warns: string[] = [];
		const provider = makeProvider();

		await runReap(
			{ dryRun: false },
			{
				store,
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
				log: (msg) => logs.push(msg),
				warn: (msg) => warns.push(msg),
			},
		);

		expect(logs).toHaveLength(1);
		expect(logs[0]).toContain("Reaped 'alice'");
	});
});
