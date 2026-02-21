import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatTimeout, runList } from "@/commands/list";
import { clearProviders, registerProvider, VMNotFoundError } from "@/provider";
import { SessionStore } from "@/session/store";
import type { Session } from "@/session/types";

describe("commands/list", () => {
	let store: SessionStore;
	let logSpy: ReturnType<typeof spyOn>;

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
		clearProviders();
	});

	afterEach(() => {
		logSpy.mockRestore();
		clearProviders();
	});

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
		registerProvider("hetzner", {
			async getVM() {
				return { id: "123", status: "failed" };
			},
			async deleteVM() {},
		});
		await runList({ format: "table", all: true }, store);
		expect((await store.get("alice")).status).toBe("failed");
	});

	test("unknown providers are handled without failing", async () => {
		await store.add({ ...runningSession, provider: "unknown" });
		await runList({ format: "table", all: true }, store);
		expect((await store.get("alice")).status).toBe("running");
	});

	test("vm not found marks active session as stopped", async () => {
		await store.add(runningSession);
		registerProvider("hetzner", {
			async getVM() {
				throw new VMNotFoundError("123");
			},
			async deleteVM() {},
		});
		await runList({ format: "table", all: true }, store);
		expect((await store.get("alice")).status).toBe("stopped");
	});

	test("formatTimeout handles nil, expired, hours, and minutes", () => {
		expect(formatTimeout(null)).toBe("-");
		expect(formatTimeout(0)).toBe("expired");
		expect(formatTimeout(2 * 60 * 60 * 1000)).toBe("2h remaining");
		expect(formatTimeout(30 * 60 * 1000)).toBe("30m remaining");
	});
});
