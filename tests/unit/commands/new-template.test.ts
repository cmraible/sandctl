import { describe, expect, test } from "bun:test";

import { runNew } from "@/commands/new";
import type { Provider, SSHKeyManager } from "@/provider/interface";
import type { CreateOpts, VM } from "@/provider/types";
import { TemplateNotFoundError } from "@/template/store";
import type { TemplateStoreLike } from "@/template/types";
import { baseProviderConfig } from "../../support/fixtures";

type ProviderLike = Provider & SSHKeyManager;

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

function makeTemplateStore(
	templates: Record<string, string> = {},
): TemplateStoreLike {
	return {
		getInitScript: async (name: string) => {
			if (name in templates) {
				return {
					name,
					normalized: name.toLowerCase().replace(/\s+/g, "-"),
					script: templates[name],
				};
			}
			throw new TemplateNotFoundError(name);
		},
		add: async () => ({
			template: "",
			original_name: "",
			created_at: "",
		}),
		get: async () => ({ template: "", original_name: "", created_at: "" }),
		list: async () => [],
		remove: async () => {},
		exists: async () => false,
		getInitScriptPath: async () => "",
	};
}

describe("commands/new --template layering", () => {
	test("assembles user_data with named template as cloud-init layer", async () => {
		const createCalls: CreateOpts[] = [];
		const provider = makeProvider({
			create: async (opts) => {
				createCalls.push(opts);
				return {
					id: "vm-123",
					name: "violet",
					status: "running",
					ipAddress: "203.0.113.10",
					region: "ash",
					serverType: "cpx31",
					createdAt: "2026-02-22T00:00:00Z",
				};
			},
		});

		await runNew(
			{ template: "web" },
			{
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
				generateSessionID: () => "violet",
				getPublicKey: async () => "ssh-ed25519 AAAA test@local",
				waitForCloudInit: async () => {},
				setupGitConfig: async () => {},
				store: {
					list: async () => [],
					add: async () => {},
					update: async () => {},
				},
				templateStore: makeTemplateStore({
					web: "#cloud-config\npackages:\n  - nginx\n",
				}),
			},
		);

		expect(createCalls).toHaveLength(1);
		const userData = createCalls[0].userData;
		expect(userData).toBeDefined();
		// Should be MIME multipart since there's a named template layer
		expect(userData).toContain("multipart/mixed");
		expect(userData).toContain("text/cloud-config");
		expect(userData).toContain("nginx");
		expect(userData).toContain("name: agent");
	});

	test("assembles user_data with user base template and named template", async () => {
		const createCalls: CreateOpts[] = [];
		const provider = makeProvider({
			create: async (opts) => {
				createCalls.push(opts);
				return {
					id: "vm-123",
					name: "violet",
					status: "running",
					ipAddress: "203.0.113.10",
					region: "ash",
					serverType: "cpx31",
					createdAt: "2026-02-22T00:00:00Z",
				};
			},
		});

		await runNew(
			{ template: "web" },
			{
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
				generateSessionID: () => "violet",
				getPublicKey: async () => "ssh-ed25519 AAAA test@local",
				waitForCloudInit: async () => {},
				setupGitConfig: async () => {},
				store: {
					list: async () => [],
					add: async () => {},
					update: async () => {},
				},
				templateStore: makeTemplateStore({
					base: "#cloud-config\npackages:\n  - git\n  - curl\n",
					web: "#!/bin/bash\napt-get install -y nginx\n",
				}),
			},
		);

		expect(createCalls).toHaveLength(1);
		const userData = createCalls[0].userData;
		expect(userData).toBeDefined();
		expect(userData).toContain("multipart/mixed");
		// Should have base cloud-config, user base cloud-config, and named shellscript
		expect(userData).toContain("name: agent");
		expect(userData).toContain("git");
		expect(userData).toContain("nginx");
		expect(userData).toContain("text/x-shellscript");
	});

	test("sends plain cloud-config when no templates exist", async () => {
		const createCalls: CreateOpts[] = [];
		const provider = makeProvider({
			create: async (opts) => {
				createCalls.push(opts);
				return {
					id: "vm-123",
					name: "violet",
					status: "running",
					ipAddress: "203.0.113.10",
					region: "ash",
					serverType: "cpx31",
					createdAt: "2026-02-22T00:00:00Z",
				};
			},
		});

		await runNew(
			{},
			{
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
				generateSessionID: () => "violet",
				getPublicKey: async () => "ssh-ed25519 AAAA test@local",
				waitForCloudInit: async () => {},
				setupGitConfig: async () => {},
				store: {
					list: async () => [],
					add: async () => {},
					update: async () => {},
				},
				templateStore: makeTemplateStore({}),
			},
		);

		expect(createCalls).toHaveLength(1);
		const userData = createCalls[0].userData;
		expect(userData).toBeDefined();
		// No additional layers — should be plain cloud-config without MIME wrapping
		expect(userData).not.toContain("multipart/mixed");
		expect(userData).toContain("#cloud-config");
		expect(userData).toContain("name: agent");
	});

	test("applies user base template even without -T flag", async () => {
		const createCalls: CreateOpts[] = [];
		const provider = makeProvider({
			create: async (opts) => {
				createCalls.push(opts);
				return {
					id: "vm-123",
					name: "violet",
					status: "running",
					ipAddress: "203.0.113.10",
					region: "ash",
					serverType: "cpx31",
					createdAt: "2026-02-22T00:00:00Z",
				};
			},
		});

		await runNew(
			{},
			{
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
				generateSessionID: () => "violet",
				getPublicKey: async () => "ssh-ed25519 AAAA test@local",
				waitForCloudInit: async () => {},
				setupGitConfig: async () => {},
				store: {
					list: async () => [],
					add: async () => {},
					update: async () => {},
				},
				templateStore: makeTemplateStore({
					base: "#cloud-config\npackages:\n  - vim\n",
				}),
			},
		);

		expect(createCalls).toHaveLength(1);
		const userData = createCalls[0].userData;
		// User base template present — should be MIME multipart
		expect(userData).toContain("multipart/mixed");
		expect(userData).toContain("vim");
	});

	test("rejects -T base with descriptive error", async () => {
		const provider = makeProvider();

		await expect(
			runNew(
				{ template: "base" },
				{
					loadConfig: async () => baseProviderConfig,
					resolveProvider: () => provider,
					generateSessionID: () => "violet",
					getPublicKey: async () => "ssh-ed25519 AAAA test@local",
					store: {
						list: async () => [],
						add: async () => {},
						update: async () => {},
					},
					templateStore: makeTemplateStore({}),
				},
			),
		).rejects.toThrow(
			"the 'base' template is applied automatically. Use `sandctl template edit base` to modify it.",
		);
	});

	test("rejects -T Base (case-insensitive) with same error", async () => {
		const provider = makeProvider();

		await expect(
			runNew(
				{ template: "Base" },
				{
					loadConfig: async () => baseProviderConfig,
					resolveProvider: () => provider,
					generateSessionID: () => "violet",
					getPublicKey: async () => "ssh-ed25519 AAAA test@local",
					store: {
						list: async () => [],
						add: async () => {},
						update: async () => {},
					},
					templateStore: makeTemplateStore({}),
				},
			),
		).rejects.toThrow("the 'base' template is applied automatically");
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
					loadConfig: async () => baseProviderConfig,
					resolveProvider: () => provider,
					generateSessionID: () => "violet",
					getPublicKey: async () => "ssh-ed25519 AAAA test@local",
					store: {
						list: async () => [],
						add: async () => {},
						update: async () => {},
					},
					templateStore: makeTemplateStore({}),
				},
			),
		).rejects.toThrow(
			"template 'Ghost' not found. Use 'sandctl template list' to see available templates",
		);

		expect(createCalled).toBe(false);
	});

	test("does not execute template script via SSH", async () => {
		const events: string[] = [];
		const provider = makeProvider();

		await runNew(
			{ template: "web" },
			{
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
				generateSessionID: () => "violet",
				getPublicKey: async () => "ssh-ed25519 AAAA test@local",
				waitForCloudInit: async () => {},
				setupGitConfig: async () => {},
				store: {
					list: async () => [],
					add: async () => {},
					update: async () => {},
				},
				templateStore: makeTemplateStore({
					web: "#!/bin/bash\necho hello\n",
				}),
				createSSHClient: () => {
					events.push("ssh-client-created");
					return {
						connect: async () => {},
						close: async () => {},
						exec: async () => {
							throw new Error("not used");
						},
						shell: async () => {
							throw new Error("not used");
						},
						sftp: async () => {
							throw new Error("not used");
						},
					};
				},
			},
		);

		// SSH client should NOT be created for template execution
		// (it may be created for other purposes like git config, but not for running template scripts)
		expect(events.filter((e) => e === "ssh-client-created").length).toBe(0);
	});
});
