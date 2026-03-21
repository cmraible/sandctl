import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runReap } from "@/commands/reap";
import type { Provider, SSHKeyManager } from "@/provider/interface";
import { SessionStore } from "@/session/store";
import type { Session } from "@/session/types";
import { baseProviderConfig } from "../../support/fixtures";

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

function expiredSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "alice",
		status: "running",
		provider: "hetzner",
		provider_id: "vm-123",
		ip_address: "203.0.113.10",
		created_at: "2020-01-01T00:00:00Z",
		timeout: "1h0m0s",
		...overrides,
	};
}

function activeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "bob",
		status: "running",
		provider: "hetzner",
		provider_id: "vm-456",
		ip_address: "203.0.113.11",
		created_at: new Date().toISOString(),
		timeout: "24h0m0s",
		...overrides,
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

	test("no sessions returns empty result", async () => {
		const result = await runReap({ dryRun: false }, store);
		expect(result).toEqual({ reaped: [], errors: 0 });
		expect(logSpy).toHaveBeenCalledWith("No expired sessions found.");
	});

	test("sessions without timeout are not reaped", async () => {
		await store.add({
			id: "notimeout",
			status: "running",
			provider: "hetzner",
			provider_id: "vm-1",
			ip_address: "1.2.3.4",
			created_at: "2020-01-01T00:00:00Z",
		});
		const result = await runReap({ dryRun: false }, store);
		expect(result).toEqual({ reaped: [], errors: 0 });
		// Session should still exist
		expect(await store.get("notimeout")).toMatchObject({ id: "notimeout" });
	});

	test("active (non-expired) sessions are not reaped", async () => {
		await store.add(activeSession());
		const result = await runReap({ dryRun: false }, store);
		expect(result).toEqual({ reaped: [], errors: 0 });
		expect(await store.get("bob")).toMatchObject({ id: "bob" });
	});

	test("stopped sessions are not reaped even if expired", async () => {
		await store.add(expiredSession({ id: "stopped", status: "stopped" }));
		const result = await runReap({ dryRun: false }, store);
		expect(result).toEqual({ reaped: [], errors: 0 });
	});

	test("expired sessions are destroyed", async () => {
		await store.add(expiredSession());
		const deleted: string[] = [];
		const provider = makeProvider(async (id) => {
			deleted.push(id);
		});

		const result = await runReap({ dryRun: false }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => provider,
		});

		expect(result.reaped).toHaveLength(1);
		expect(result.reaped[0].id).toBe("alice");
		expect(result.reaped[0].destroyed).toBe(true);
		expect(result.errors).toBe(0);
		expect(deleted).toEqual(["vm-123"]);
		await expect(store.get("alice")).rejects.toBeDefined();
	});

	test("multiple expired sessions are all reaped", async () => {
		await store.add(expiredSession({ id: "alice", provider_id: "vm-1" }));
		await store.add(expiredSession({ id: "carol", provider_id: "vm-2" }));
		// Active session should be left alone
		await store.add(activeSession());

		const deleted: string[] = [];
		const provider = makeProvider(async (id) => {
			deleted.push(id);
		});

		const result = await runReap({ dryRun: false }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => provider,
		});

		expect(result.reaped).toHaveLength(2);
		expect(result.errors).toBe(0);
		expect(deleted).toContain("vm-1");
		expect(deleted).toContain("vm-2");
		// Active session still exists
		expect(await store.get("bob")).toMatchObject({ id: "bob" });
	});

	test("dry run does not destroy sessions", async () => {
		await store.add(expiredSession());

		const result = await runReap({ dryRun: true }, store);

		expect(result.reaped).toHaveLength(1);
		expect(result.reaped[0].id).toBe("alice");
		expect(result.reaped[0].destroyed).toBe(false);
		expect(result.errors).toBe(0);
		// Session should still exist
		expect(await store.get("alice")).toMatchObject({ id: "alice" });
	});

	test("dry run outputs preview", async () => {
		await store.add(expiredSession());

		await runReap({ dryRun: true }, store);

		expect(logSpy).toHaveBeenCalledWith("Expired sessions (dry run):");
	});

	test("per-session errors do not abort other sessions", async () => {
		await store.add(expiredSession({ id: "alice", provider_id: "vm-1" }));
		await store.add(expiredSession({ id: "carol", provider_id: "vm-2" }));

		let callCount = 0;
		const provider = makeProvider(async (id) => {
			callCount++;
			if (id === "vm-1") {
				throw new Error("provider error");
			}
		});

		const result = await runReap({ dryRun: false }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => provider,
		});

		expect(callCount).toBe(2);
		expect(result.errors).toBe(1);
		expect(result.reaped).toHaveLength(2);

		const alice = result.reaped.find((r) => r.id === "alice");
		const carol = result.reaped.find((r) => r.id === "carol");
		expect(alice?.destroyed).toBe(false);
		expect(alice?.error).toContain("provider error");
		expect(carol?.destroyed).toBe(true);

		// alice should still exist (failed), carol should be gone
		expect(await store.get("alice")).toMatchObject({ id: "alice" });
		await expect(store.get("carol")).rejects.toBeDefined();
	});

	test("error entries include error message", async () => {
		await store.add(expiredSession());
		const provider = makeProvider(async () => {
			throw new Error("cloud API down");
		});

		const result = await runReap({ dryRun: false }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => provider,
		});

		expect(result.reaped[0].error).toContain("cloud API down");
		expect(warnSpy).toHaveBeenCalled();
	});

	test("silent option suppresses console output", async () => {
		await store.add(expiredSession());
		const provider = makeProvider();

		const result = await runReap({ dryRun: false, silent: true }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => provider,
		});

		expect(result.reaped[0].destroyed).toBe(true);
		expect(logSpy).not.toHaveBeenCalled();
	});

	test("silent dry run suppresses output", async () => {
		await store.add(expiredSession());

		await runReap({ dryRun: true, silent: true }, store);

		expect(logSpy).not.toHaveBeenCalled();
	});

	test("result includes age and timeout fields", async () => {
		await store.add(expiredSession());
		const provider = makeProvider();

		const result = await runReap({ dryRun: false }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => provider,
		});

		expect(result.reaped[0].timeout).toBe("1h0m0s");
		expect(result.reaped[0].age).toBeDefined();
		expect(result.reaped[0].age.length).toBeGreaterThan(0);
	});
});
