import { describe, expect, test } from "bun:test";

import { runConsole } from "@/commands/console";
import type { Config } from "@/config/config";
import type { Session } from "@/session/types";

const AGENT_MODE_CONFIG: Config = {
	default_provider: "hetzner",
	ssh_key_source: "agent",
	ssh_public_key_inline: "ssh-ed25519 AAAA test@local",
};

function runningSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "alice",
		status: "running",
		provider: "hetzner",
		provider_id: "vm-123",
		ip_address: "203.0.113.10",
		created_at: "2026-02-20T00:00:00Z",
		...overrides,
	};
}

describe("commands/console", () => {
	test("rejects with exit code 5 when session is not running", async () => {
		await expect(
			runConsole("alice", {
				store: {
					get: async () => runningSession({ status: "failed" }),
				},
			}),
		).rejects.toMatchObject({
			exitCode: 5,
		});
	});

	test("resolves normalized name and opens interactive console", async () => {
		const events: string[] = [];

		await runConsole("Alice", {
			store: {
				get: async (id: string) => {
					events.push(`store.get:${id}`);
					return runningSession();
				},
			},
			loadConfig: async () => AGENT_MODE_CONFIG,
			createSSHClient: (options) => {
				events.push(`client.host:${options.host}`);
				events.push(`client.useAgent:${String(options.useAgent)}`);
				return {
					connect: async () => {
						events.push("client.connect");
					},
					close: async () => {
						events.push("client.close");
					},
					exec: async () => {
						throw new Error("not used");
					},
					shell: async () => {
						throw new Error("not used");
					},
				};
			},
			openRemoteConsole: async () => {
				events.push("console.open");
			},
		});

		expect(events).toContain("store.get:alice");
		expect(events).toContain("client.host:203.0.113.10");
		expect(events).toContain("client.useAgent:true");
		expect(events).toContain("client.connect");
		expect(events).toContain("console.open");
		expect(events).toContain("client.close");
	});

	test("closes SSH client when openRemoteConsole throws", async () => {
		const events: string[] = [];

		await expect(
			runConsole("alice", {
				store: {
					get: async () => runningSession(),
				},
				loadConfig: async () => AGENT_MODE_CONFIG,
				createSSHClient: () => {
					return {
						connect: async () => {
							events.push("client.connect");
						},
						close: async () => {
							events.push("client.close");
						},
						exec: async () => {
							throw new Error("not used");
						},
						shell: async () => {
							throw new Error("not used");
						},
					};
				},
				openRemoteConsole: async () => {
					events.push("console.open");
					throw new Error("console failed");
				},
			}),
		).rejects.toThrow("console failed");

		expect(events).toEqual(["client.connect", "console.open", "client.close"]);
	});
});
