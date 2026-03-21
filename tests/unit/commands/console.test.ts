import { describe, expect, test } from "bun:test";

import { runConsole } from "@/commands/console";
import type { Config } from "@/config/config";
import { agentModeConfig, makeRunningSession } from "../../support/fixtures";

const configWithHook: Config = {
	...agentModeConfig,
	hooks: {
		"new-console-session": "tmux new-session -d -s main",
	},
};

describe("commands/console", () => {
	test("rejects with exit code 5 when session is not running", async () => {
		await expect(
			runConsole("alice", {
				store: {
					get: async () => makeRunningSession({ status: "failed" }),
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
					return makeRunningSession();
				},
			},
			loadConfig: async () => agentModeConfig,
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
					get: async () => makeRunningSession(),
				},
				loadConfig: async () => agentModeConfig,
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

	test("runs new-console-session hook before opening console", async () => {
		const events: string[] = [];

		await runConsole("alice", {
			store: {
				get: async () => makeRunningSession(),
			},
			loadConfig: async () => configWithHook,
			createSSHClient: () => ({
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
			}),
			runRemoteCommand: async (_client, command) => {
				events.push(`hook.exec:${command}`);
				return { stdout: "", stderr: "", exitCode: 0 };
			},
			openRemoteConsole: async () => {
				events.push("console.open");
			},
		});

		expect(events).toEqual([
			"client.connect",
			"hook.exec:tmux new-session -d -s main",
			"console.open",
			"client.close",
		]);
	});

	test("opens console normally when no hook configured", async () => {
		const events: string[] = [];

		await runConsole("alice", {
			store: {
				get: async () => makeRunningSession(),
			},
			loadConfig: async () => agentModeConfig,
			createSSHClient: () => ({
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
			}),
			runRemoteCommand: async () => {
				events.push("hook.exec");
				return { stdout: "", stderr: "", exitCode: 0 };
			},
			openRemoteConsole: async () => {
				events.push("console.open");
			},
		});

		expect(events).toEqual(["client.connect", "console.open", "client.close"]);
	});

	test("hook failure does not prevent console from opening", async () => {
		const events: string[] = [];

		await runConsole("alice", {
			store: {
				get: async () => makeRunningSession(),
			},
			loadConfig: async () => configWithHook,
			createSSHClient: () => ({
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
			}),
			runRemoteCommand: async () => {
				events.push("hook.exec");
				throw new Error("hook command failed");
			},
			openRemoteConsole: async () => {
				events.push("console.open");
			},
		});

		expect(events).toEqual([
			"client.connect",
			"hook.exec",
			"console.open",
			"client.close",
		]);
	});
});
