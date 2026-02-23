import { describe, expect, test } from "bun:test";

import { runExec } from "@/commands/exec";
import type { Config } from "@/config/config";
import type { Session } from "@/session/types";

const FILE_MODE_CONFIG: Config = {
	default_provider: "hetzner",
	ssh_public_key: "~/.ssh/id_ed25519.pub",
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

describe("commands/exec", () => {
	test("propagates stdout/stderr and non-zero exit code for --command", async () => {
		const writes = { stdout: "", stderr: "" };
		const events: string[] = [];

		const exitCode = await runExec(
			"Alice",
			{ command: "exit 42" },
			{
				store: {
					get: async (id: string) => {
						events.push(`store.get:${id}`);
						return runningSession();
					},
				},
				loadConfig: async () => FILE_MODE_CONFIG,
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
					};
				},
				runRemoteCommand: async (_client, command: string) => {
					events.push(`remote.exec:${command}`);
					return {
						stdout: "hello\n",
						stderr: "boom\n",
						exitCode: 42,
					};
				},
				openRemoteConsole: async () => {
					throw new Error("not used");
				},
				stdout: {
					write: (chunk: string | Uint8Array) => {
						writes.stdout +=
							typeof chunk === "string"
								? chunk
								: Buffer.from(chunk).toString("utf8");
						return true;
					},
				},
				stderr: {
					write: (chunk: string | Uint8Array) => {
						writes.stderr +=
							typeof chunk === "string"
								? chunk
								: Buffer.from(chunk).toString("utf8");
						return true;
					},
				},
			},
		);

		expect(exitCode).toBe(42);
		expect(writes).toEqual({ stdout: "hello\n", stderr: "boom\n" });
		expect(events).toContain("store.get:alice");
		expect(events).toContain("remote.exec:exit 42");
		expect(events).toContain("client.connect");
		expect(events).toContain("client.close");
	});

	test("returns command exit code 5 when session is not running", async () => {
		await expect(
			runExec(
				"alice",
				{ command: "echo test" },
				{
					store: {
						get: async () => runningSession({ status: "stopped" }),
					},
				},
			),
		).rejects.toMatchObject({
			exitCode: 5,
		});
	});

	test("without --command opens interactive console and returns 0", async () => {
		const events: string[] = [];
		const exitCode = await runExec(
			"alice",
			{},
			{
				store: {
					get: async () => runningSession(),
				},
				loadConfig: async () => FILE_MODE_CONFIG,
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
				runRemoteCommand: async () => {
					throw new Error("not used");
				},
				openRemoteConsole: async () => {
					events.push("console.open");
				},
			},
		);

		expect(exitCode).toBe(0);
		expect(events).toEqual(["client.connect", "console.open", "client.close"]);
	});

	test("rejects when --command is provided as empty or whitespace", async () => {
		for (const command of ["", "   "]) {
			const events: string[] = [];

			await expect(
				runExec(
					"alice",
					{ command },
					{
						store: {
							get: async () => runningSession(),
						},
						loadConfig: async () => FILE_MODE_CONFIG,
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
						runRemoteCommand: async () => {
							throw new Error("not used");
						},
						openRemoteConsole: async () => {
							events.push("console.open");
						},
					},
				),
			).rejects.toThrow("--command cannot be empty or whitespace");

			expect(events).not.toContain("console.open");
		}
	});

	test("closes SSH client when runRemoteCommand throws", async () => {
		const events: string[] = [];

		await expect(
			runExec(
				"alice",
				{ command: "uname -a" },
				{
					store: {
						get: async () => runningSession(),
					},
					loadConfig: async () => FILE_MODE_CONFIG,
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
					runRemoteCommand: async () => {
						events.push("remote.exec");
						throw new Error("exec failed");
					},
					openRemoteConsole: async () => {
						throw new Error("not used");
					},
				},
			),
		).rejects.toThrow("exec failed");

		expect(events).toEqual(["client.connect", "remote.exec", "client.close"]);
	});

	test("closes SSH client when openRemoteConsole throws in exec", async () => {
		const events: string[] = [];

		await expect(
			runExec(
				"alice",
				{},
				{
					store: {
						get: async () => runningSession(),
					},
					loadConfig: async () => FILE_MODE_CONFIG,
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
					runRemoteCommand: async () => {
						throw new Error("not used");
					},
					openRemoteConsole: async () => {
						events.push("console.open");
						throw new Error("console failed");
					},
				},
			),
		).rejects.toThrow("console failed");

		expect(events).toEqual(["client.connect", "console.open", "client.close"]);
	});
});
