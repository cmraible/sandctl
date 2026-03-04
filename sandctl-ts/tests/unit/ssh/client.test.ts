import { describe, expect, test } from "bun:test";

import { SSHClient, type SSHConnectionLike } from "@/ssh/client";

function createFakeConnection(): SSHConnectionLike {
	return {
		connect: () => {},
		on: () => createFakeConnection(),
		once: () => createFakeConnection(),
		exec: (_command, callback) => callback(new Error("not used")),
		shell: (_opts, callback) => callback(new Error("not used")),
		end: () => {},
	};
}

describe("ssh/client", () => {
	test("connects with discovered agent socket when useAgent is enabled", async () => {
		let connectConfig: Record<string, unknown> | undefined;
		const connection: SSHConnectionLike = {
			...createFakeConnection(),
			connect: (config) => {
				connectConfig = config;
			},
			once: (event, handler) => {
				if (event === "ready") {
					queueMicrotask(() => handler());
				}
				return connection;
			},
		};

		const client = new SSHClient(
			{ host: "192.0.2.10", useAgent: true },
			{
				createConnection: () => connection,
				discoverAgentSocket: async () => "/tmp/agent.sock",
				readPrivateKey: async () => {
					throw new Error("not used");
				},
			},
		);

		await client.connect();

		expect(connectConfig).toMatchObject({
			host: "192.0.2.10",
			port: 22,
			username: "agent",
			agent: "/tmp/agent.sock",
		});
	});

	test("connects with private key when key path is provided", async () => {
		let connectConfig: Record<string, unknown> | undefined;
		const connection: SSHConnectionLike = {
			...createFakeConnection(),
			connect: (config) => {
				connectConfig = config;
			},
			once: (event, handler) => {
				if (event === "ready") {
					queueMicrotask(() => handler());
				}
				return connection;
			},
		};

		const client = new SSHClient(
			{ host: "192.0.2.11", privateKeyPath: "/tmp/id_ed25519" },
			{
				createConnection: () => connection,
				discoverAgentSocket: async () => undefined,
				readPrivateKey: async () => "PRIVATE-KEY",
			},
		);

		await client.connect();

		expect(connectConfig).toMatchObject({
			host: "192.0.2.11",
			privateKey: "PRIVATE-KEY",
		});
	});

	test("close ends the underlying connection and marks client disconnected", async () => {
		let endCalls = 0;
		const connection: SSHConnectionLike = {
			...createFakeConnection(),
			once: (event, handler) => {
				if (event === "ready") {
					queueMicrotask(() => handler());
				}
				return connection;
			},
			end: () => {
				endCalls += 1;
			},
		};

		const client = new SSHClient(
			{ host: "192.0.2.12", privateKeyPath: "/tmp/id_ed25519" },
			{
				createConnection: () => connection,
				discoverAgentSocket: async () => undefined,
				readPrivateKey: async () => "PRIVATE-KEY",
			},
		);

		await client.connect();
		await client.close();

		expect(endCalls).toBe(1);
		await expect(client.exec("whoami")).rejects.toThrow(
			"ssh client is not connected",
		);
	});
});
