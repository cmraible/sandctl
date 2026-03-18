import { describe, expect, test } from "bun:test";

import { runStatus } from "@/commands/status";
import { makeRunningSession } from "../../support/fixtures";

describe("commands/status", () => {
	test("returns status result for a running session", async () => {
		const result = await runStatus("alice", {
			store: {
				get: async () => makeRunningSession(),
			},
		});

		expect(result.id).toBe("alice");
		expect(result.status).toBe("running");
		expect(result.provider).toBe("hetzner");
		expect(result.provider_id).toBe("vm-123");
		expect(result.ip_address).toBe("203.0.113.10");
		expect(result.failure_reason).toBeNull();
	});

	test("normalizes session name", async () => {
		let lookedUp = "";

		await runStatus("Alice", {
			store: {
				get: async (id: string) => {
					lookedUp = id;
					return makeRunningSession();
				},
			},
		});

		expect(lookedUp).toBe("alice");
	});

	test("rejects with exit code 4 when session not found", async () => {
		const { NotFoundError } = await import("@/session/types");

		await expect(
			runStatus("missing", {
				store: {
					get: async () => {
						throw new NotFoundError("missing");
					},
				},
			}),
		).rejects.toMatchObject({
			exitCode: 4,
		});
	});

	test("includes failure reason when present", async () => {
		const result = await runStatus("alice", {
			store: {
				get: async () =>
					makeRunningSession({
						status: "failed",
						failure_reason: "cloud-init timeout",
					}),
			},
		});

		expect(result.status).toBe("failed");
		expect(result.failure_reason).toBe("cloud-init timeout");
	});

	test("shows timeout remaining when timeout is set", async () => {
		const result = await runStatus("alice", {
			store: {
				get: async () =>
					makeRunningSession({
						timeout: "2h0m0s",
						created_at: new Date().toISOString(),
					}),
			},
		});

		expect(result.timeout).toBe("2h0m0s");
		expect(result.timeout_remaining).toContain("remaining");
	});

	test("shows dash for missing optional fields", async () => {
		const result = await runStatus("alice", {
			store: {
				get: async () =>
					makeRunningSession({
						ip_address: "",
						region: undefined,
						server_type: undefined,
					}),
			},
		});

		expect(result.ip_address).toBe("-");
		expect(result.region).toBe("-");
		expect(result.server_type).toBe("-");
	});

	test("computes uptime from created_at", async () => {
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

		const result = await runStatus("alice", {
			store: {
				get: async () => makeRunningSession({ created_at: oneHourAgo }),
			},
		});

		expect(result.uptime).toBe("1h");
	});
});
