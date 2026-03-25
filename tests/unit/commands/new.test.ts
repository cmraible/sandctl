import { describe, expect, test } from "bun:test";

import { type NewResult, runNew, runNewCommand } from "@/commands/new";
import { HetznerProvider } from "@/hetzner/provider";
import type { Provider, SSHKeyManager } from "@/provider/interface";
import type { VM } from "@/provider/types";
import type { Session } from "@/session/types";
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

describe("commands/new", () => {
	test("deletes VM and persists failed session when waitReady fails", async () => {
		const deleted: string[] = [];
		const added: Session[] = [];
		const updates: { id: string; updates: Partial<Session> }[] = [];
		const provider = makeProvider({
			waitReady: async () => {
				throw new Error("vm never became ready");
			},
			delete: async (id: string) => {
				deleted.push(id);
			},
		});

		await expect(
			runNew(
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
						add: async (session: Session) => {
							added.push(session);
						},
						update: async (id: string, u: Partial<Session>) => {
							updates.push({ id, updates: u });
						},
					},
				},
			),
		).rejects.toThrow("vm never became ready");

		expect(deleted).toEqual(["vm-123"]);
		expect(added).toHaveLength(1);
		expect(added[0]).toMatchObject({
			id: "violet",
			status: "provisioning",
			provider: "hetzner",
			provider_id: "vm-123",
			ip_address: "203.0.113.10",
		});
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatchObject({
			id: "violet",
			updates: { status: "failed", failure_reason: "vm never became ready" },
		});
	});

	test("persists failed session even when cleanup delete fails", async () => {
		const added: Session[] = [];
		const updates: { id: string; updates: Partial<Session> }[] = [];
		const provider = makeProvider({
			waitReady: async () => {
				throw new Error("setup step failed");
			},
			delete: async () => {
				throw new Error("delete boom");
			},
		});

		await expect(
			runNew(
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
						add: async (session: Session) => {
							added.push(session);
						},
						update: async (id: string, u: Partial<Session>) => {
							updates.push({ id, updates: u });
						},
					},
				},
			),
		).rejects.toThrow("setup step failed");

		expect(added).toHaveLength(1);
		expect(added[0]).toMatchObject({
			id: "violet",
			status: "provisioning",
			provider: "hetzner",
			provider_id: "vm-123",
		});
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatchObject({
			id: "violet",
			updates: { status: "failed" },
		});
	});

	test("uses custom name when --name is provided", async () => {
		const added: Session[] = [];
		const provider = makeProvider();

		const result = await runNew(
			{ name: "my-project" },
			{
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
				generateSessionID: () => "violet",
				getPublicKey: async () => "ssh-ed25519 AAAA test@local",
				waitForCloudInit: async () => {},
				setupGitConfig: async () => {},
				store: {
					list: async () => [],
					add: async (s: Session) => {
						added.push(s);
					},
					update: async () => {},
				},
			},
		);

		expect(result.session.id).toBe("my-project");
		expect(added[0].id).toBe("my-project");
	});

	test("rejects invalid custom name", async () => {
		const provider = makeProvider();

		await expect(
			runNew(
				{ name: "-bad" },
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
				},
			),
		).rejects.toThrow("invalid session name");
	});

	test("rejects duplicate custom name", async () => {
		const provider = makeProvider();

		await expect(
			runNew(
				{ name: "existing" },
				{
					loadConfig: async () => baseProviderConfig,
					resolveProvider: () => provider,
					generateSessionID: () => "violet",
					getPublicKey: async () => "ssh-ed25519 AAAA test@local",
					waitForCloudInit: async () => {},
					setupGitConfig: async () => {},
					store: {
						list: async () => [
							{
								id: "existing",
								status: "running",
								provider: "hetzner",
								provider_id: "vm-456",
								ip_address: "203.0.113.11",
								created_at: "2026-02-22T00:00:00Z",
							},
						],
						add: async () => {},
						update: async () => {},
					},
				},
			),
		).rejects.toThrow("already exists");
	});

	test("--size resolves to correct server type", async () => {
		let createdOpts: Record<string, unknown> = {};
		const provider = makeProvider({
			create: async (opts) => {
				createdOpts = opts;
				return {
					id: "vm-123",
					name: "violet",
					status: "running",
					ipAddress: "203.0.113.10",
					region: "ash",
					serverType: "cpx41",
					createdAt: "2026-02-22T00:00:00Z",
				};
			},
		});

		await runNew(
			{ size: "large" },
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
			},
		);

		expect(createdOpts.serverType).toBe("cpx41");
	});

	test("--size rejects unknown size names", async () => {
		const provider = makeProvider();

		await expect(
			runNew(
				{ size: "mega" },
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
				},
			),
		).rejects.toThrow("unknown size 'mega'");
	});

	test("command wrapper shows progress and logs VM name", async () => {
		const events: string[] = [];
		await runNewCommand({}, undefined, {
			runNew: async () => ({
				session: {
					id: "violet",
					status: "running",
					provider: "hetzner",
					provider_id: "vm-123",
					ip_address: "203.0.113.10",
					created_at: "2026-02-22T00:00:00Z",
				},
			}),
			createSpinner: () => ({
				succeed: (message: string) => {
					events.push(`succeed:${message}`);
				},
				fail: (message: string) => {
					events.push(`fail:${message}`);
				},
				update: () => {},
			}),
			log: (message: string) => {
				events.push(`log:${message}`);
			},
		});

		expect(events).toEqual([
			"succeed:Created VM 'violet'.",
			"log:Use 'sandctl console violet' to connect.",
			"log:Use 'sandctl destroy violet' when done.",
		]);
	});

	test("command wrapper marks spinner as failed on errors", async () => {
		const events: string[] = [];
		await expect(
			runNewCommand({}, undefined, {
				runNew: async (): Promise<NewResult> => {
					throw new Error("boom");
				},
				createSpinner: () => ({
					succeed: () => {},
					fail: (message: string) => {
						events.push(`fail:${message}`);
					},
					update: () => {},
				}),
				log: () => {},
			}),
		).rejects.toThrow("boom");

		expect(events).toEqual(["fail:Failed to provision VM."]);
	});

	test("runNew returns backgroundTasks for deferred snapshot creation on fresh boot", async () => {
		const snapshotEvents: string[] = [];
		const mockClient = {
			createServer: async () => ({
				id: 1,
				name: "violet",
				status: "running",
				public_net: { ipv4: { ip: "203.0.113.10" } },
				datacenter: { location: { name: "ash" } },
				server_type: { name: "cpx31" },
				created: "2026-02-22T00:00:00Z",
			}),
			getServer: async () => ({
				id: 1,
				name: "violet",
				status: "running",
				public_net: { ipv4: { ip: "203.0.113.10" } },
				datacenter: { location: { name: "ash" } },
				server_type: { name: "cpx31" },
				created: "2026-02-22T00:00:00Z",
			}),
			listSSHKeys: async () => [],
			createSSHKey: async () => ({
				id: 1,
				name: "test",
				fingerprint: "abc",
				public_key: "ssh-ed25519 AAAA",
			}),
			listImages: async () => [],
			createImage: async () => ({
				id: 999,
				description: "sandctl-base",
				status: "available",
				type: "snapshot",
				labels: {},
				created_from: { id: 1, name: "test" },
			}),
			getImage: async () => ({
				id: 999,
				description: "sandctl-base",
				status: "available",
				type: "snapshot",
				labels: {},
				created_from: { id: 1, name: "test" },
			}),
			deleteImage: async () => {},
			deleteServer: async () => {},
			listServers: async () => [],
			updateServer: async () => ({
				id: 1,
				name: "violet",
				status: "running",
				public_net: { ipv4: { ip: "203.0.113.10" } },
				datacenter: { location: { name: "ash" } },
				server_type: { name: "cpx31" },
				created: "2026-02-22T00:00:00Z",
			}),
			listDatacenters: async () => [],
		};
		const provider = new HetznerProvider(
			{ token: "test-token" },
			mockClient as never,
			async () => {},
			async () => true,
		);

		const result = await runNew(
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
				createSnapshot: async () => {
					snapshotEvents.push("snapshot-created");
					return { id: 999, description: "sandctl-base" } as never;
				},
				cleanupSnapshots: async () => {
					snapshotEvents.push("cleanup-done");
				},
			},
		);

		expect(result.session.status).toBe("running");
		// Background tasks should be defined (snapshot creation deferred)
		expect(result.backgroundTasks).toBeDefined();
		// Snapshot hasn't completed yet until we await
		await result.backgroundTasks;
		expect(snapshotEvents).toEqual(["snapshot-created", "cleanup-done"]);
	});

	test("runNew returns no backgroundTasks when booting from snapshot", async () => {
		const mockClient = {
			createServer: async () => ({
				id: 1,
				name: "violet",
				status: "running",
				public_net: { ipv4: { ip: "203.0.113.10" } },
				datacenter: { location: { name: "ash" } },
				server_type: { name: "cpx31" },
				created: "2026-02-22T00:00:00Z",
			}),
			getServer: async () => ({
				id: 1,
				name: "violet",
				status: "running",
				public_net: { ipv4: { ip: "203.0.113.10" } },
				datacenter: { location: { name: "ash" } },
				server_type: { name: "cpx31" },
				created: "2026-02-22T00:00:00Z",
			}),
			listSSHKeys: async () => [],
			createSSHKey: async () => ({
				id: 1,
				name: "test",
				fingerprint: "abc",
				public_key: "ssh-ed25519 AAAA",
			}),
			listImages: async () => [],
			createImage: async () => ({
				id: 999,
				description: "sandctl-base",
				status: "available",
				type: "snapshot",
				labels: {},
				created_from: { id: 1, name: "test" },
			}),
			getImage: async () => ({
				id: 999,
				description: "sandctl-base",
				status: "available",
				type: "snapshot",
				labels: {},
				created_from: { id: 1, name: "test" },
			}),
			deleteImage: async () => {},
			deleteServer: async () => {},
			listServers: async () => [],
			updateServer: async () => ({
				id: 1,
				name: "violet",
				status: "running",
				public_net: { ipv4: { ip: "203.0.113.10" } },
				datacenter: { location: { name: "ash" } },
				server_type: { name: "cpx31" },
				created: "2026-02-22T00:00:00Z",
			}),
			listDatacenters: async () => [],
		};
		const provider = new HetznerProvider(
			{ token: "test-token" },
			mockClient as never,
			async () => {},
			async () => true,
		);

		const result = await runNew(
			{},
			{
				loadConfig: async () => baseProviderConfig,
				resolveProvider: () => provider,
				generateSessionID: () => "violet",
				getPublicKey: async () => "ssh-ed25519 AAAA test@local",
				waitForCloudInit: async () => {},
				setupGitConfig: async () => {},
				runSSHSetup: async () => {},
				findSnapshot: async () =>
					({
						id: 123,
						description: "sandctl-base",
					}) as never,
				store: {
					list: async () => [],
					add: async () => {},
					update: async () => {},
				},
			},
		);

		expect(result.session.status).toBe("running");
		// No background tasks when booting from existing snapshot
		expect(result.backgroundTasks).toBeUndefined();
	});

	test("backgroundTasks resolves silently when snapshot creation fails", async () => {
		const warnings: string[] = [];
		const mockClient = {
			createServer: async () => ({
				id: 1,
				name: "violet",
				status: "running",
				public_net: { ipv4: { ip: "203.0.113.10" } },
				datacenter: { location: { name: "ash" } },
				server_type: { name: "cpx31" },
				created: "2026-02-22T00:00:00Z",
			}),
			getServer: async () => ({
				id: 1,
				name: "violet",
				status: "running",
				public_net: { ipv4: { ip: "203.0.113.10" } },
				datacenter: { location: { name: "ash" } },
				server_type: { name: "cpx31" },
				created: "2026-02-22T00:00:00Z",
			}),
			listSSHKeys: async () => [],
			createSSHKey: async () => ({
				id: 1,
				name: "test",
				fingerprint: "abc",
				public_key: "ssh-ed25519 AAAA",
			}),
			listImages: async () => [],
			deleteServer: async () => {},
			listServers: async () => [],
			updateServer: async () => ({
				id: 1,
				name: "violet",
				status: "running",
				public_net: { ipv4: { ip: "203.0.113.10" } },
				datacenter: { location: { name: "ash" } },
				server_type: { name: "cpx31" },
				created: "2026-02-22T00:00:00Z",
			}),
			listDatacenters: async () => [],
			createImage: async () => {
				throw new Error("not used");
			},
			getImage: async () => {
				throw new Error("not used");
			},
			deleteImage: async () => {},
		};
		const provider = new HetznerProvider(
			{ token: "test-token" },
			mockClient as never,
			async () => {},
			async () => true,
		);

		const result = await runNew(
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
				createSnapshot: async () => {
					throw new Error("snapshot API error");
				},
				warn: (msg: string) => {
					warnings.push(msg);
				},
			},
		);

		// Should not throw
		await result.backgroundTasks;
		expect(warnings).toEqual([
			"[warn] Snapshot creation failed: snapshot API error",
		]);
	});

	test("command wrapper awaits backgroundTasks after console", async () => {
		const order: string[] = [];

		await runNewCommand({}, undefined, {
			runNew: async () => ({
				session: {
					id: "violet",
					status: "running",
					provider: "hetzner",
					provider_id: "vm-123",
					ip_address: "203.0.113.10",
					created_at: "2026-02-22T00:00:00Z",
				},
				backgroundTasks: Promise.resolve().then(() => {
					order.push("background-done");
				}),
			}),
			createSpinner: () => ({
				succeed: () => {},
				fail: () => {},
				update: () => {},
			}),
			log: () => {},
			warn: () => {},
		});

		// runNewCommand should have awaited backgroundTasks before returning
		expect(order).toEqual(["background-done"]);
	});
});
