import { describe, expect, test } from "bun:test";

import { runDetails } from "@/commands/details";
import type { Config } from "@/config/config";
import type { VM } from "@/provider/types";
import { makeRunningSession } from "../../support/fixtures";

function makeVM(overrides: Partial<VM> = {}): VM {
	return {
		id: "vm-123",
		name: "alice",
		status: "running",
		ipAddress: "203.0.113.10",
		region: "ash",
		serverType: "cpx11",
		createdAt: "2026-02-20T00:00:00Z",
		cores: 2,
		memoryGB: 2,
		diskGB: 40,
		cpuType: "shared",
		image: "Ubuntu 24.04",
		...overrides,
	};
}

const stubConfig: Config = {
	providers: { hetzner: { token: "test" } },
};

describe("commands/details", () => {
	test("returns details with live VM data", async () => {
		const result = await runDetails("alice", {
			store: { get: async () => makeRunningSession({ provider: "hetzner" }) },
			loadConfig: async () => stubConfig,
			getProvider: () => ({
				name: () => "hetzner",
				create: async () => makeVM(),
				get: async () => makeVM(),
				delete: async () => {},
				list: async () => [],
				waitReady: async () => {},
			}),
		});

		expect(result.id).toBe("alice");
		expect(result.status).toBe("running");
		expect(result.ip_address).toBe("203.0.113.10");
		expect(result.cores).toBe(2);
		expect(result.memory_gb).toBe(2);
		expect(result.disk_gb).toBe(40);
		expect(result.cpu_type).toBe("shared");
		expect(result.image).toBe("Ubuntu 24.04");
	});

	test("shows null image when VM has no image data", async () => {
		const result = await runDetails("alice", {
			store: { get: async () => makeRunningSession({ provider: "hetzner" }) },
			loadConfig: async () => stubConfig,
			getProvider: () => ({
				name: () => "hetzner",
				create: async () => makeVM(),
				get: async () => makeVM({ image: undefined }),
				delete: async () => {},
				list: async () => [],
				waitReady: async () => {},
			}),
		});

		expect(result.image).toBeNull();
	});

	test("falls back to session data when provider is unavailable", async () => {
		const result = await runDetails("alice", {
			store: {
				get: async () =>
					makeRunningSession({
						provider: "hetzner",
						provider_id: "",
					}),
			},
			loadConfig: async () => stubConfig,
			getProvider: () => ({
				name: () => "hetzner",
				create: async () => makeVM(),
				get: async () => makeVM(),
				delete: async () => {},
				list: async () => [],
				waitReady: async () => {},
			}),
		});

		expect(result.image).toBeNull();
		expect(result.cores).toBeNull();
	});

	test("rejects with exit code 4 when session not found", async () => {
		const { NotFoundError } = await import("@/session/types");

		await expect(
			runDetails("missing", {
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
});
