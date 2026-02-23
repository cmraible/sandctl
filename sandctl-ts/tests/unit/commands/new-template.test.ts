import { describe, expect, test } from "bun:test";

import { runNew } from "@/commands/new";
import type { Config } from "@/config/config";
import type { Provider, SSHKeyManager } from "@/provider/interface";
import type { VM } from "@/provider/types";
import { TemplateNotFoundError } from "@/template/store";

type ProviderLike = Provider & SSHKeyManager;

const BASE_CONFIG: Config = {
	default_provider: "hetzner",
	ssh_public_key: "~/.ssh/id_ed25519.pub",
	providers: {
		hetzner: {
			token: "token",
			region: "ash",
			server_type: "cpx31",
			image: "ubuntu-24.04",
		},
	},
};

function makeProvider(overrides: Partial<ProviderLike> = {}): ProviderLike {
	const createdVM: VM = {
		id: "vm-123",
		name: "violet",
		status: "running",
		ipAddress: "203.0.113.10",
		region: "ash",
		serverType: "cpx31",
		createdAt: "2026-02-22T00:00:00Z",
	};

	return {
		name: () => "hetzner",
		create: async () => createdVM,
		get: async () => createdVM,
		delete: async () => {},
		list: async () => [],
		waitReady: async () => {},
		ensureSSHKey: async () => "ssh-key-id",
		...overrides,
	};
}

describe("commands/new --template", () => {
	test("executes template script remotely with template env vars", async () => {
		const events: string[] = [];
		const provider = makeProvider();

		await runNew(
			{ template: "My API" },
			{
				loadConfig: async () => BASE_CONFIG,
				resolveProvider: () => provider,
				generateSessionID: () => "violet",
				getPublicKey: async () => "ssh-ed25519 AAAA test@local",
				store: {
					list: async () => [],
					add: async () => {},
				},
				templateStore: {
					getInitScript: async () => ({
						name: "My API",
						normalized: "my-api",
						script: "echo templated\n",
					}),
				},
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
				runRemoteTemplate: async (_client, command, script) => {
					events.push(`remote.command:${command}`);
					events.push(`remote.script:${script.trim()}`);
					return { stdout: "", stderr: "", exitCode: 0 };
				},
			},
		);

		expect(events).toContain("client.host:203.0.113.10");
		expect(events).toContain("client.connect");
		expect(events).toContain("client.close");
		expect(
			events.some((entry) => entry.includes("SANDCTL_TEMPLATE_NAME='My API'")),
		).toBe(true);
		expect(
			events.some((entry) =>
				entry.includes("SANDCTL_TEMPLATE_NORMALIZED='my-api'"),
			),
		).toBe(true);
		expect(events).toContain("remote.script:echo templated");
	});

	test("shell-quotes template name with single quote in remote command", async () => {
		const events: string[] = [];
		const provider = makeProvider();

		await runNew(
			{ template: "Bob's App" },
			{
				loadConfig: async () => BASE_CONFIG,
				resolveProvider: () => provider,
				generateSessionID: () => "violet",
				getPublicKey: async () => "ssh-ed25519 AAAA test@local",
				store: {
					list: async () => [],
					add: async () => {},
				},
				templateStore: {
					getInitScript: async () => ({
						name: "Bob's App",
						normalized: "bob-s-app",
						script: "echo templated\n",
					}),
				},
				createSSHClient: () => ({
					connect: async () => {},
					close: async () => {},
					exec: async () => {
						throw new Error("not used");
					},
					shell: async () => {
						throw new Error("not used");
					},
				}),
				runRemoteTemplate: async (_client, command) => {
					events.push(command);
					return { stdout: "", stderr: "", exitCode: 0 };
				},
			},
		);

		expect(
			events.some((command) =>
				command.includes("SANDCTL_TEMPLATE_NAME='Bob'\\''s App'"),
			),
		).toBe(true);
	});

	test("returns clear error when template is missing", async () => {
		let createCalled = false;
		const provider = makeProvider({
			create: async () => {
				createCalled = true;
				throw new Error("not expected");
			},
		});

		await expect(
			runNew(
				{ template: "Ghost" },
				{
					loadConfig: async () => BASE_CONFIG,
					resolveProvider: () => provider,
					generateSessionID: () => "violet",
					getPublicKey: async () => "ssh-ed25519 AAAA test@local",
					store: {
						list: async () => [],
						add: async () => {},
					},
					templateStore: {
						getInitScript: async () => {
							throw new TemplateNotFoundError("Ghost");
						},
					},
				},
			),
		).rejects.toThrow(
			"template 'Ghost' not found. Use 'sandctl template list' to see available templates",
		);

		expect(createCalled).toBe(false);
	});
});
