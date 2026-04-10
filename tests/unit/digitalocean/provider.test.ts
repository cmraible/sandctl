import { describe, expect, test } from "bun:test";

import {
	type DigitalOceanClientLike,
	DigitalOceanProvider,
} from "@/digitalocean/provider";
import { calculateFingerprint } from "@/digitalocean/ssh-keys";
import { ErrTimeout } from "@/provider/errors";

const TEST_PUBLIC_KEY =
	"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFV7B8ZLSz6NBI8PrkQ15S9M0W0Hafzz4u9i9Q8fQxXW test@sandctl";

describe("digitalocean/provider", () => {
	test("waitReady requires SSH to be reachable before succeeding", async () => {
		const states = [
			{ status: "new", ip: null },
			{ status: "active", ip: null },
			{ status: "active", ip: "203.0.113.10" },
			{ status: "active", ip: "203.0.113.10" },
		];
		let i = 0;
		let sleepCalls = 0;
		let probeCalls = 0;
		let now = 0;

		const client: DigitalOceanClientLike = {
			createDroplet: async () => {
				throw new Error("not used");
			},
			getDroplet: async () => {
				const current = states[Math.min(i, states.length - 1)];
				i += 1;
				return {
					id: 1,
					name: "vm",
					status: current.status,
					created_at: "2026-02-20T00:00:00Z",
					networks: current.ip
						? { v4: [{ ip_address: current.ip, type: "public" }] }
						: { v4: [] },
					region: { slug: "nyc1" },
					size_slug: "s-4vcpu-8gb",
				};
			},
			deleteDroplet: async () => {},
			listDroplets: async () => [],
			createSSHKey: async () => ({ id: 1, name: "k", fingerprint: "fp" }),
			listSSHKeys: async () => [],
			postDropletAction: async () => {
				throw new Error("not used");
			},
			getDropletAction: async () => {
				throw new Error("not used");
			},
			listSnapshots: async () => [],
			deleteSnapshot: async () => {},
		};

		const provider = new DigitalOceanProvider(
			{ token: "token" },
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

		await provider.waitReady("1", 15_000);
		expect(i).toBe(3);
		expect(probeCalls).toBe(2);
		expect(sleepCalls).toBe(3);
	});

	test("waitReady times out when SSH never becomes reachable", async () => {
		let probeCalls = 0;
		let sleepCalls = 0;
		let now = 0;

		const client: DigitalOceanClientLike = {
			createDroplet: async () => {
				throw new Error("not used");
			},
			getDroplet: async () => ({
				id: 1,
				name: "vm",
				status: "active",
				created_at: "2026-02-20T00:00:00Z",
				networks: { v4: [{ ip_address: "203.0.113.10", type: "public" }] },
				region: { slug: "nyc1" },
				size_slug: "s-4vcpu-8gb",
			}),
			deleteDroplet: async () => {},
			listDroplets: async () => [],
			createSSHKey: async () => ({ id: 1, name: "k", fingerprint: "fp" }),
			listSSHKeys: async () => [],
			postDropletAction: async () => {
				throw new Error("not used");
			},
			getDropletAction: async () => {
				throw new Error("not used");
			},
			listSnapshots: async () => [],
			deleteSnapshot: async () => {},
		};

		const provider = new DigitalOceanProvider(
			{ token: "token" },
			client,
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

		await expect(provider.waitReady("1", 10_000)).rejects.toBeInstanceOf(
			ErrTimeout,
		);
		expect(probeCalls).toBeGreaterThan(0);
		expect(sleepCalls).toBeGreaterThan(0);
	});

	test("ensureSSHKey deduplicates by fingerprint", async () => {
		const fingerprint = calculateFingerprint(TEST_PUBLIC_KEY);
		const client: DigitalOceanClientLike = {
			createDroplet: async () => {
				throw new Error("not used");
			},
			getDroplet: async () => {
				throw new Error("not used");
			},
			deleteDroplet: async () => {},
			listDroplets: async () => [],
			createSSHKey: async () => {
				throw new Error("must not create duplicate key");
			},
			listSSHKeys: async () => [{ id: 99, name: "existing", fingerprint }],
			postDropletAction: async () => {
				throw new Error("not used");
			},
			getDropletAction: async () => {
				throw new Error("not used");
			},
			listSnapshots: async () => [],
			deleteSnapshot: async () => {},
		};

		const provider = new DigitalOceanProvider(
			{ token: "token" },
			client,
			async () => {},
		);
		const keyID = await provider.ensureSSHKey("sandctl", TEST_PUBLIC_KEY);

		expect(keyID).toBe("99");
	});

	test("rename waits for the rename action to complete", async () => {
		const actions: Array<Record<string, unknown>> = [];
		let polls = 0;
		const client: DigitalOceanClientLike = {
			createDroplet: async () => {
				throw new Error("not used");
			},
			getDroplet: async () => {
				throw new Error("not used");
			},
			deleteDroplet: async () => {},
			listDroplets: async () => [],
			createSSHKey: async () => ({ id: 1, name: "k", fingerprint: "fp" }),
			listSSHKeys: async () => [],
			postDropletAction: async (_dropletId, body) => {
				actions.push(body);
				return { id: 42, type: "rename", status: "in-progress" };
			},
			getDropletAction: async () => {
				polls += 1;
				return {
					id: 42,
					type: "rename",
					status: polls >= 2 ? "completed" : "in-progress",
				};
			},
			listSnapshots: async () => [],
			deleteSnapshot: async () => {},
		};

		const provider = new DigitalOceanProvider(
			{ token: "token" },
			client,
			async () => {},
		);

		await provider.rename("123", "renamed-vm");

		expect(actions).toEqual([{ type: "rename", name: "renamed-vm" }]);
		expect(polls).toBe(2);
	});

	test("resize powers off, resizes, then powers on", async () => {
		const actions: string[] = [];
		let actionPolls = 0;
		let dropletStatus = "active";

		const client: DigitalOceanClientLike = {
			createDroplet: async () => {
				throw new Error("not used");
			},
			getDroplet: async () => ({
				id: 1,
				name: "vm",
				status: dropletStatus,
				created_at: "2026-02-20T00:00:00Z",
				networks: { v4: [{ ip_address: "203.0.113.10", type: "public" }] },
				region: { slug: "nyc1" },
				size_slug: "s-4vcpu-8gb",
			}),
			deleteDroplet: async () => {},
			listDroplets: async () => [],
			createSSHKey: async () => ({ id: 1, name: "k", fingerprint: "fp" }),
			listSSHKeys: async () => [],
			postDropletAction: async (_dropletId, body) => {
				actions.push(String(body.type));
				if (body.type === "power_off") {
					dropletStatus = "off";
				}
				if (body.type === "power_on") {
					dropletStatus = "active";
				}
				return {
					id: actions.length,
					type: String(body.type),
					status: "completed",
				};
			},
			getDropletAction: async (_dropletId, actionId) => {
				actionPolls += 1;
				return { id: Number(actionId), type: "test", status: "completed" };
			},
			listSnapshots: async () => [],
			deleteSnapshot: async () => {},
		};

		const provider = new DigitalOceanProvider(
			{ token: "token" },
			client,
			async () => {},
		);

		await provider.resize("123", "s-8vcpu-16gb", true);

		expect(actions).toEqual(["power_off", "resize", "power_on"]);
		expect(actionPolls).toBe(3);
	});

	test("createSnapshot waits for the action then resolves the created snapshot", async () => {
		let listCalls = 0;
		const client: DigitalOceanClientLike = {
			createDroplet: async () => {
				throw new Error("not used");
			},
			getDroplet: async () => {
				throw new Error("not used");
			},
			deleteDroplet: async () => {},
			listDroplets: async () => [],
			createSSHKey: async () => ({ id: 1, name: "k", fingerprint: "fp" }),
			listSSHKeys: async () => [],
			postDropletAction: async () => ({
				id: 77,
				type: "snapshot",
				status: "in-progress",
			}),
			getDropletAction: async () => ({
				id: 77,
				type: "snapshot",
				status: "completed",
			}),
			listSnapshots: async () => {
				listCalls += 1;
				if (listCalls === 1) {
					return [];
				}
				return [
					{
						id: 456,
						name: "sandctl-base-vb94d27b9934d",
						resource_id: "123",
						resource_type: "droplet",
						regions: ["nyc1"],
						min_disk_size: 25,
						size_gigabytes: 1.23,
						created_at: "2026-02-20T00:00:00Z",
					},
				];
			},
			deleteSnapshot: async () => {},
		};

		const provider = new DigitalOceanProvider(
			{ token: "token" },
			client,
			async () => {},
		);

		const snapshot = await provider.createSnapshot("123", "hello world");

		expect(snapshot).toEqual({ id: "456" });
		expect(listCalls).toBe(2);
	});
});
