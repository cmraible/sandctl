import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionStore } from "@/session/store";
import { NotFoundError } from "@/session/types";
import { baseSession } from "../../support/fixtures";

describe("session/store", () => {
	let store: SessionStore;
	let storePath: string;

	beforeEach(async () => {
		const dir = await mkdtemp(join(tmpdir(), "sandctl-store-test-"));
		storePath = join(dir, "sessions.json");
		store = new SessionStore(storePath);
	});

	test("add persists to JSON file", async () => {
		await store.add(baseSession);
		const sessions = await store.list();
		expect(sessions).toHaveLength(1);
		expect(sessions[0].id).toBe("alice");
	});

	test("add rejects duplicate IDs", async () => {
		await store.add(baseSession);
		expect(store.add({ ...baseSession, id: "ALICE" })).rejects.toThrow();
	});

	test("get is case-insensitive", async () => {
		await store.add(baseSession);
		const session = await store.get("Alice");
		expect(session.id).toBe("alice");
	});

	test("get throws NotFoundError for missing sessions", async () => {
		expect(store.get("missing")).rejects.toBeInstanceOf(NotFoundError);
	});

	test("remove deletes session from file", async () => {
		await store.add(baseSession);
		await store.remove("alice");
		expect(await store.list()).toHaveLength(0);
	});

	test("update merges partial updates", async () => {
		await store.add(baseSession);
		await store.update("alice", { status: "stopped", ip_address: "5.6.7.8" });
		const updated = await store.get("alice");
		expect(updated.status).toBe("stopped");
		expect(updated.ip_address).toBe("5.6.7.8");
		expect(updated.provider_id).toBe("123");
	});

	test("list returns all sessions", async () => {
		await store.add(baseSession);
		await store.add({ ...baseSession, id: "bob", provider_id: "456" });
		expect(await store.list()).toHaveLength(2);
	});

	test("listActive filters to provisioning and running", async () => {
		await store.add(baseSession);
		await store.add({
			...baseSession,
			id: "bob",
			status: "provisioning",
			provider_id: "456",
		});
		await store.add({
			...baseSession,
			id: "charlie",
			status: "stopped",
			provider_id: "789",
		});
		const active = await store.listActive();
		expect(active.map((session) => session.id).sort()).toEqual([
			"alice",
			"bob",
		]);
	});

	test("empty file returns empty array", async () => {
		await writeFile(storePath, "");
		expect(await store.list()).toEqual([]);
	});

	test("missing file returns empty array", async () => {
		expect(await store.list()).toEqual([]);
	});

	test("malformed file returns parse error", async () => {
		await writeFile(storePath, "{not json");
		await expect(store.list()).rejects.toThrow("failed to parse sessions file");
	});

	test("loads legacy sessions without provider fields", async () => {
		await writeFile(
			storePath,
			JSON.stringify({
				sessions: [
					{
						id: "legacy",
						status: "running",
						created_at: "2026-02-20T00:00:00Z",
					},
				],
			}),
		);

		const sessions = await store.list();
		expect(sessions).toHaveLength(1);
		expect(sessions[0].provider).toBe("");
		expect(sessions[0].provider_id).toBe("");
		expect(sessions[0].ip_address).toBe("");
	});

	test("invalid structure error is concise", async () => {
		await writeFile(
			storePath,
			JSON.stringify({
				sessions: [{ id: 123, status: "running", created_at: "not-a-date" }],
			}),
		);

		try {
			await store.list();
			expect.unreachable();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			expect(message).toContain("invalid sessions file structure:");
			expect(message).not.toContain('"code"');
			expect(message.length).toBeLessThan(400);
		}
	});
});
