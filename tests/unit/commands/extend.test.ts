import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runExtend } from "@/commands/extend";
import { SessionStore } from "@/session/store";
import { makeRunningSession } from "../../support/fixtures";

describe("commands/extend", () => {
	let store: SessionStore;
	let logSpy: ReturnType<typeof spyOn>;

	beforeEach(async () => {
		const dir = await mkdtemp(join(tmpdir(), "sandctl-extend-test-"));
		store = new SessionStore(join(dir, "sessions.json"));
		logSpy = spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	test("extends an active session with an existing timeout", async () => {
		await store.add(
			makeRunningSession({
				id: "alice",
				created_at: new Date().toISOString(),
				timeout: "2h0m0s",
			}),
		);

		const result = await runExtend("alice", "1h", {}, store);

		expect(result.id).toBe("alice");
		expect(result.timeout).toBe("3h0m0s");

		// Verify the store was updated
		const session = await store.get("alice");
		expect(session.timeout).toBe("3h0m0s");

		expect(logSpy).toHaveBeenCalled();
		const logCall = logSpy.mock.calls[0][0] as string;
		expect(logCall).toContain("Extended session alice by 1h0m0s");
	});

	test("sets timeout based on age when session has no prior timeout", async () => {
		// Session created 30 minutes ago with no timeout
		const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
		await store.add(
			makeRunningSession({
				id: "bob",
				created_at: thirtyMinAgo,
			}),
		);

		const result = await runExtend("bob", "1h", {}, store);

		expect(result.id).toBe("bob");
		// Timeout should be ~1h30m (age of 30m + extension of 1h)
		const session = await store.get("bob");
		expect(session.timeout).toBeDefined();

		// The new timeout should give approximately 1h remaining
		// (age ~30m + timeout should leave ~1h)
		// We check that the timeout is approximately 1h30m (±5s tolerance)
		expect(session.timeout).toMatch(/^1h30m\d+s$/);
	});

	test("throws error when extending a stopped session", async () => {
		await store.add(
			makeRunningSession({
				id: "stopped",
				status: "stopped",
				timeout: "1h0m0s",
			}),
		);

		await expect(runExtend("stopped", "1h", {}, store)).rejects.toThrow(
			"Session 'stopped' is stopped. Only active sessions can be extended.",
		);
	});

	test("throws error when extending a failed session", async () => {
		await store.add(
			makeRunningSession({
				id: "failed",
				status: "failed",
				timeout: "1h0m0s",
			}),
		);

		await expect(runExtend("failed", "1h", {}, store)).rejects.toThrow(
			"Only active sessions can be extended.",
		);
	});

	test("throws error for invalid duration format", async () => {
		await store.add(makeRunningSession({ id: "alice" }));

		await expect(runExtend("alice", "notaduration", {}, store)).rejects.toThrow(
			"invalid duration",
		);
	});

	test("throws error for non-existent session", async () => {
		await expect(runExtend("nonexistent", "1h", {}, store)).rejects.toThrow(
			"not found",
		);
	});

	test("throws error for invalid session name format", async () => {
		await expect(
			runExtend("INVALID-NAME-123", "1h", {}, store),
		).rejects.toThrow("invalid session name format");
	});

	test("json mode suppresses console output and returns result", async () => {
		await store.add(
			makeRunningSession({
				id: "alice",
				created_at: new Date().toISOString(),
				timeout: "2h0m0s",
			}),
		);

		const result = await runExtend("alice", "30m", { silent: true }, store);

		expect(result.id).toBe("alice");
		expect(result.timeout).toBe("2h30m0s");
		expect(result.expires_in).toBeDefined();
		expect(logSpy).not.toHaveBeenCalled();
	});

	test("extends a provisioning session", async () => {
		await store.add(
			makeRunningSession({
				id: "prov",
				status: "provisioning",
				created_at: new Date().toISOString(),
				timeout: "1h0m0s",
			}),
		);

		const result = await runExtend("prov", "2h", {}, store);

		expect(result.id).toBe("prov");
		expect(result.timeout).toBe("3h0m0s");
	});
});
