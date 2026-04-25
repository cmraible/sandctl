import { describe, expect, test } from "bun:test";

import { type GcpClientLike, GcpProvider } from "@/gcp/provider";
import { ErrTimeout } from "@/provider/errors";

const TEST_PUBLIC_KEY =
	"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFV7B8ZLSz6NBI8PrkQ15S9M0W0Hafzz4u9i9Q8fQxXW test@sandctl";

function makeClient(overrides: Partial<GcpClientLike> = {}): GcpClientLike {
	return {
		insertInstance: async () => ({ name: "op", status: "DONE" }),
		getInstance: async (_project, zone, name) => ({
			id: "123",
			name,
			status: "RUNNING",
			creationTimestamp: "2026-02-20T00:00:00Z",
			zone: `projects/test/zones/${zone}`,
			machineType: `projects/test/zones/${zone}/machineTypes/e2-standard-4`,
			networkInterfaces: [{ accessConfigs: [{ natIP: "203.0.113.10" }] }],
			disks: [{ boot: true, diskSizeGb: "50" }],
		}),
		deleteInstance: async () => ({ name: "op", status: "DONE" }),
		resetInstance: async () => ({ name: "op", status: "DONE" }),
		listInstances: async () => [],
		waitZoneOperation: async () => ({ name: "op", status: "DONE" }),
		...overrides,
	};
}

describe("gcp/provider", () => {
	test("create sends Compute Engine instance metadata and labels", async () => {
		let created: Record<string, unknown> | undefined;
		const client = makeClient({
			insertInstance: async (opts) => {
				created = opts.instanceResource;
				return { name: "insert-op", status: "DONE" };
			},
		});
		const provider = new GcpProvider({ project_id: "test-project" }, client);

		const vm = await provider.create({
			name: "vm",
			sshKeyIDs: [TEST_PUBLIC_KEY],
			userData: "#cloud-config\n",
		});

		expect(vm.id).toBe("us-central1-a/vm");
		expect(created?.labels).toEqual({ "managed-by": "sandctl" });
		expect(created?.machineType).toBe(
			"zones/us-central1-a/machineTypes/e2-standard-4",
		);
		expect(created?.metadata).toEqual({
			items: [
				{ key: "ssh-keys", value: `agent:${TEST_PUBLIC_KEY}` },
				{ key: "user-data", value: "#cloud-config\n" },
			],
		});
	});

	test("ensureSSHKey returns the public key for instance metadata injection", async () => {
		const provider = new GcpProvider(
			{ project_id: "test-project" },
			makeClient(),
		);

		await expect(
			provider.ensureSSHKey("sandctl", TEST_PUBLIC_KEY),
		).resolves.toBe(TEST_PUBLIC_KEY);
	});

	test("list filters to sandctl-managed instances", async () => {
		let filter: string | undefined;
		const client = makeClient({
			listInstances: async (_project, _zone, requestedFilter) => {
				filter = requestedFilter;
				return [
					{
						id: "123",
						name: "vm",
						status: "RUNNING",
						creationTimestamp: "2026-02-20T00:00:00Z",
						machineType:
							"projects/test/zones/us-central1-a/machineTypes/e2-standard-4",
					},
				];
			},
		});
		const provider = new GcpProvider({ project_id: "test-project" }, client);

		const vms = await provider.list();

		expect(filter).toBe("labels.managed-by = sandctl");
		expect(vms[0].id).toBe("us-central1-a/vm");
		expect(vms[0].name).toBe("vm");
	});

	test("delete uses zone/name provider ids for non-default zones", async () => {
		let deleted: { zone: string; name: string } | undefined;
		const client = makeClient({
			deleteInstance: async (_project, zone, name) => {
				deleted = { zone, name };
				return { name: "delete-op", status: "DONE" };
			},
		});
		const provider = new GcpProvider({ project_id: "test-project" }, client);

		await provider.delete("us-east1-b/vm");

		expect(deleted).toEqual({ zone: "us-east1-b", name: "vm" });
	});

	test("waitReady requires SSH to be reachable before succeeding", async () => {
		const states = [
			{ status: "PROVISIONING", ip: null },
			{ status: "RUNNING", ip: null },
			{ status: "RUNNING", ip: "203.0.113.10" },
			{ status: "RUNNING", ip: "203.0.113.10" },
		];
		let i = 0;
		let sleepCalls = 0;
		let probeCalls = 0;
		let now = 0;

		const client = makeClient({
			getInstance: async (_project, zone, name) => {
				const current = states[Math.min(i, states.length - 1)];
				i += 1;
				return {
					id: "123",
					name,
					status: current.status,
					creationTimestamp: "2026-02-20T00:00:00Z",
					zone: `projects/test/zones/${zone}`,
					machineType: `projects/test/zones/${zone}/machineTypes/e2-standard-4`,
					networkInterfaces: current.ip
						? [{ accessConfigs: [{ natIP: current.ip }] }]
						: [{ accessConfigs: [] }],
				};
			},
		});

		const provider = new GcpProvider(
			{ project_id: "test-project" },
			client,
			async (ms) => {
				sleepCalls += 1;
				now += ms;
			},
			async (_host, _port, timeoutMs) => {
				probeCalls += 1;
				now += timeoutMs;
				return probeCalls >= 2;
			},
			() => now,
		);

		await provider.waitReady("vm", 15_000);
		expect(i).toBe(3);
		expect(probeCalls).toBe(2);
		expect(sleepCalls).toBe(3);
	});

	test("waitReady times out when SSH never becomes reachable", async () => {
		let probeCalls = 0;
		let sleepCalls = 0;
		let now = 0;

		const provider = new GcpProvider(
			{ project_id: "test-project" },
			makeClient(),
			async (ms) => {
				sleepCalls += 1;
				now += ms;
			},
			async (_host, _port, timeoutMs) => {
				probeCalls += 1;
				now += timeoutMs;
				return false;
			},
			() => now,
		);

		await expect(provider.waitReady("vm", 10_000)).rejects.toBeInstanceOf(
			ErrTimeout,
		);
		expect(probeCalls).toBeGreaterThan(0);
		expect(sleepCalls).toBeGreaterThan(0);
	});
});
