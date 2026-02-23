import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatTimeout, runList } from "@/commands/list";
import type { Provider, SSHKeyManager } from "@/provider/interface";
import type { VM } from "@/provider/types";
import { SessionStore } from "@/session/store";
import type { Session } from "@/session/types";
import { baseProviderConfig } from "../../support/fixtures";

describe("commands/list", () => {
	let store: SessionStore;
	let logSpy: ReturnType<typeof spyOn>;
	let warnSpy: ReturnType<typeof spyOn>;

	const runningSession: Session = {
		id: "alice",
		status: "running",
		provider: "hetzner",
		provider_id: "123",
		ip_address: "1.2.3.4",
		created_at: "2026-02-20T00:00:00Z",
		timeout: "2h0m0s",
	};

	beforeEach(async () => {
		const dir = await mkdtemp(join(tmpdir(), "sandctl-list-test-"));
		store = new SessionStore(join(dir, "sessions.json"));
		logSpy = spyOn(console, "log").mockImplementation(() => {});
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
		warnSpy.mockRestore();
	});

	function makeProvider(vms: VM[]): Provider & SSHKeyManager {
		return {
			name: () => "hetzner",
			create: async () => {
				throw new Error("not implemented");
			},
			get: async () => {
				throw new Error("not implemented");
			},
			delete: async () => {
				throw new Error("not implemented");
			},
			list: async () => vms,
			waitReady: async () => {
				throw new Error("not implemented");
			},
			ensureSSHKey: async () => "1",
		};
	}

	test("json format prints empty array when no active sessions", async () => {
		await runList({ format: "json", all: false }, store);
		expect(logSpy).toHaveBeenCalledWith("[]");
	});

	test("legacy active sessions are marked stopped and omitted from active view", async () => {
		await store.add({
			...runningSession,
			id: "legacy",
			provider: "",
			provider_id: "",
		});
		const events: string[] = [];
		const update = store.update.bind(store);
		store.update = async (...args) => {
			events.push("update");
			return update(...args);
		};
		logSpy.mockImplementation((message: unknown) => {
			events.push(`log:${String(message)}`);
		});
		await runList({ format: "table", all: false }, store);
		const updated = await store.get("legacy");
		expect(updated.status).toBe("stopped");
		expect(logSpy).toHaveBeenCalledWith("No active sessions.");
		expect(events[0]).toBe("update");
		expect(events).toContain("log:No active sessions.");
	});

	test("provider sync updates session status", async () => {
		await store.add(runningSession);
		await runList({ format: "table", all: true }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () =>
				makeProvider([
					{
						id: "123",
						name: "alice",
						status: "failed",
						ipAddress: "1.2.3.4",
						region: "ash",
						serverType: "cpx31",
						createdAt: "2026-02-20T00:00:00Z",
					},
				]),
		});
		expect((await store.get("alice")).status).toBe("failed");
	});

	test("unknown providers are handled without failing", async () => {
		await store.add({ ...runningSession, provider: "unknown" });
		await runList({ format: "table", all: true }, store, {
			loadConfig: async () => baseProviderConfig,
		});
		expect((await store.get("alice")).status).toBe("running");
		expect(warnSpy).toHaveBeenCalled();
	});

	test("missing vm in provider list marks active session as stopped", async () => {
		await store.add(runningSession);
		await runList({ format: "table", all: true }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => makeProvider([]),
		});
		expect((await store.get("alice")).status).toBe("stopped");
	});

	test("provider sync failures are warnings and listing still succeeds", async () => {
		await store.add(runningSession);
		const provider = makeProvider([]);
		provider.list = async () => {
			throw new Error("sync unavailable");
		};
		await runList({ format: "table", all: true }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => provider,
		});
		expect(warnSpy).toHaveBeenCalled();
		expect(await store.get("alice")).toMatchObject({
			id: "alice",
			status: "running",
			provider_id: "123",
		});
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("alice"));
	});

	test("provider resolution failures fall back to local session data", async () => {
		await store.add(runningSession);
		await runList({ format: "table", all: true }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => {
				throw new Error("registry unavailable");
			},
		});
		expect(warnSpy).toHaveBeenCalled();
		expect(await store.get("alice")).toMatchObject({
			id: "alice",
			status: "running",
			provider_id: "123",
		});
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("alice"));
	});

	test("sync calls provider list once for multiple sessions", async () => {
		await store.add(runningSession);
		await store.add({
			...runningSession,
			id: "bob",
			provider_id: "456",
			ip_address: "5.6.7.8",
		});
		let listCalls = 0;
		const provider = makeProvider([
			{
				id: "123",
				name: "alice",
				status: "running",
				ipAddress: "1.2.3.4",
				region: "ash",
				serverType: "cpx31",
				createdAt: "2026-02-20T00:00:00Z",
			},
			{
				id: "456",
				name: "bob",
				status: "running",
				ipAddress: "5.6.7.8",
				region: "ash",
				serverType: "cpx31",
				createdAt: "2026-02-20T00:00:00Z",
			},
		]);
		provider.list = async () => {
			listCalls += 1;
			return await Promise.resolve([
				{
					id: "123",
					name: "alice",
					status: "running",
					ipAddress: "1.2.3.4",
					region: "ash",
					serverType: "cpx31",
					createdAt: "2026-02-20T00:00:00Z",
				},
				{
					id: "456",
					name: "bob",
					status: "running",
					ipAddress: "5.6.7.8",
					region: "ash",
					serverType: "cpx31",
					createdAt: "2026-02-20T00:00:00Z",
				},
			]);
		};

		await runList({ format: "table", all: true }, store, {
			loadConfig: async () => baseProviderConfig,
			resolveProvider: () => provider,
		});

		expect(listCalls).toBe(1);
	});

	test("formatTimeout handles nil, expired, hours, and minutes", () => {
		expect(formatTimeout(null)).toBe("-");
		expect(formatTimeout(0)).toBe("expired");
		expect(formatTimeout(2 * 60 * 60 * 1000)).toBe("2h remaining");
		expect(formatTimeout(30 * 60 * 1000)).toBe("30m remaining");
	});
});
