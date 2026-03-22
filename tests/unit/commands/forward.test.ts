import { describe, expect, test } from "bun:test";

import { runForward } from "@/commands/forward";
import { agentModeConfig, makeRunningSession } from "../../support/fixtures";

describe("commands/forward", () => {
	test("rejects with exit code 1 when no -L specs provided", async () => {
		await expect(
			runForward("alice", [], {
				store: {
					get: async () => makeRunningSession(),
				},
			}),
		).rejects.toMatchObject({
			exitCode: 1,
		});
	});

	test("rejects with exit code 5 when session is not running", async () => {
		await expect(
			runForward("alice", ["8080:localhost:80"], {
				store: {
					get: async () => makeRunningSession({ status: "failed" }),
				},
			}),
		).rejects.toMatchObject({
			exitCode: 5,
		});
	});

	test("rejects with exit code 4 when session not found", async () => {
		const { NotFoundError } = await import("@/session/types");
		await expect(
			runForward("alice", ["8080:localhost:80"], {
				store: {
					get: async () => {
						throw new NotFoundError("alice");
					},
				},
			}),
		).rejects.toMatchObject({
			exitCode: 4,
		});
	});

	test("rejects with error when forward spec is invalid", async () => {
		await expect(
			runForward("alice", ["invalid-spec"], {
				store: {
					get: async () => makeRunningSession(),
				},
			}),
		).rejects.toThrow("invalid forward spec");
	});

	test("opens tunnels and waits for signal", async () => {
		const events: string[] = [];

		await runForward("Alice", ["8080:localhost:80", "5432:db.internal:5432"], {
			store: {
				get: async (id: string) => {
					events.push(`store.get:${id}`);
					return makeRunningSession();
				},
			},
			loadConfig: async () => agentModeConfig,
			createSSHClient: (options) => {
				events.push(`client.host:${options.host}`);
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
					sftp: async () => {
						throw new Error("not used");
					},
					forwardOut: async () => {
						throw new Error("not used");
					},
				};
			},
			openTunnels: async (_client, specs) => {
				events.push(`tunnels.open:${specs.length}`);
				return specs.map((spec) => ({
					spec,
					server: {} as never,
					close: async () => {
						events.push(`tunnel.close:${spec.localPort}`);
					},
				}));
			},
			log: (message: string) => {
				events.push(`log:${message}`);
			},
			waitForSignal: () =>
				new Promise<void>((resolve) => {
					resolve();
				}),
		});

		expect(events).toContain("store.get:alice");
		expect(events).toContain("client.host:203.0.113.10");
		expect(events).toContain("client.connect");
		expect(events).toContain("tunnels.open:2");
		expect(events).toContain("tunnel.close:8080");
		expect(events).toContain("tunnel.close:5432");
		expect(events).toContain("client.close");
	});

	test("closes SSH client when openTunnels throws", async () => {
		const events: string[] = [];

		await expect(
			runForward("alice", ["8080:localhost:80"], {
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
					sftp: async () => {
						throw new Error("not used");
					},
					forwardOut: async () => {
						throw new Error("not used");
					},
				}),
				openTunnels: async () => {
					events.push("tunnels.open");
					throw new Error("EADDRINUSE");
				},
				log: () => {},
				waitForSignal: async () => {},
			}),
		).rejects.toThrow("EADDRINUSE");

		expect(events).toEqual(["client.connect", "tunnels.open", "client.close"]);
	});
});
