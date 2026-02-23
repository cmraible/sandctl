import { describe, expect, test } from "bun:test";

import { type HetznerClientLike, HetznerProvider } from "@/hetzner/provider";
import { calculateFingerprint } from "@/hetzner/ssh-keys";
import { ErrTimeout } from "@/provider/errors";

const TEST_PUBLIC_KEY =
	"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFV7B8ZLSz6NBI8PrkQ15S9M0W0Hafzz4u9i9Q8fQxXW test@sandctl";

describe("hetzner/provider", () => {
	test("waitReady requires SSH to be reachable before succeeding", async () => {
		const states = [
			{ status: "starting", ip: null },
			{ status: "running", ip: null },
			{ status: "running", ip: "203.0.113.10" },
			{ status: "running", ip: "203.0.113.10" },
		];
		let i = 0;
		let sleepCalls = 0;
		let probeCalls = 0;
		let now = 0;

		const client: HetznerClientLike = {
			createServer: async () => {
				throw new Error("not used");
			},
			getServer: async () => {
				const current = states[Math.min(i, states.length - 1)];
				i += 1;
				return {
					id: 1,
					name: "vm",
					status: current.status,
					created: "2026-02-20T00:00:00Z",
					public_net: { ipv4: { ip: current.ip } },
					server_type: { name: "cpx31" },
					datacenter: { location: { name: "ash" } },
				};
			},
			deleteServer: async () => {},
			listServers: async () => [],
			createSSHKey: async () => ({ id: 1, name: "k", fingerprint: "fp" }),
			listSSHKeys: async () => [],
			listDatacenters: async () => [],
		};

		const provider = new HetznerProvider(
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
		let sleepCalls = 0;
		let probeCalls = 0;
		let now = 0;
		const client: HetznerClientLike = {
			createServer: async () => {
				throw new Error("not used");
			},
			getServer: async () => ({
				id: 1,
				name: "vm",
				status: "running",
				created: "2026-02-20T00:00:00Z",
				public_net: { ipv4: { ip: "203.0.113.10" } },
				server_type: { name: "cpx31" },
				datacenter: { location: { name: "ash" } },
			}),
			deleteServer: async () => {},
			listServers: async () => [],
			createSSHKey: async () => ({ id: 1, name: "k", fingerprint: "fp" }),
			listSSHKeys: async () => [],
			listDatacenters: async () => [],
		};

		const provider = new HetznerProvider(
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

	test("waitReady enforces timeout budget across SSH probe retries", async () => {
		let probeCalls = 0;
		let now = 0;
		const client: HetznerClientLike = {
			createServer: async () => {
				throw new Error("not used");
			},
			getServer: async () => ({
				id: 1,
				name: "vm",
				status: "running",
				created: "2026-02-20T00:00:00Z",
				public_net: { ipv4: { ip: "203.0.113.10" } },
				server_type: { name: "cpx31" },
				datacenter: { location: { name: "ash" } },
			}),
			deleteServer: async () => {},
			listServers: async () => [],
			createSSHKey: async () => ({ id: 1, name: "k", fingerprint: "fp" }),
			listSSHKeys: async () => [],
			listDatacenters: async () => [],
		};

		const provider = new HetznerProvider(
			{ token: "token" },
			client,
			async () => {},
			async () => {
				probeCalls += 1;
				now += 120;
				return true;
			},
			() => now,
		);

		await expect(provider.waitReady("1", 100)).rejects.toBeInstanceOf(
			ErrTimeout,
		);
		expect(probeCalls).toBe(1);
	});

	test("create rejects malformed ssh key ids", async () => {
		const client: HetznerClientLike = {
			createServer: async () => {
				throw new Error("not used");
			},
			getServer: async () => {
				throw new Error("not used");
			},
			deleteServer: async () => {},
			listServers: async () => [],
			createSSHKey: async () => ({ id: 1, name: "k", fingerprint: "fp" }),
			listSSHKeys: async () => [],
			listDatacenters: async () => [],
		};

		const provider = new HetznerProvider(
			{ token: "token" },
			client,
			async () => {},
		);

		await expect(
			provider.create({ name: "vm", sshKeyIDs: ["12abc"] }),
		).rejects.toThrow("invalid ssh key id: 12abc");
	});

	test("ensureSSHKey deduplicates by fingerprint", async () => {
		const fingerprint = calculateFingerprint(TEST_PUBLIC_KEY);
		const client: HetznerClientLike = {
			createServer: async () => {
				throw new Error("not used");
			},
			getServer: async () => {
				throw new Error("not used");
			},
			deleteServer: async () => {},
			listServers: async () => [],
			createSSHKey: async () => {
				throw new Error("must not create duplicate key");
			},
			listSSHKeys: async () => [{ id: 99, name: "existing", fingerprint }],
			listDatacenters: async () => [],
		};

		const provider = new HetznerProvider(
			{ token: "token" },
			client,
			async () => {},
		);
		const keyID = await provider.ensureSSHKey("sandctl", TEST_PUBLIC_KEY);

		expect(keyID).toBe("99");
	});

	test("ensureSSHKey creates key when fingerprint does not match", async () => {
		let createCalls = 0;
		const client: HetznerClientLike = {
			createServer: async () => {
				throw new Error("not used");
			},
			getServer: async () => {
				throw new Error("not used");
			},
			deleteServer: async () => {},
			listServers: async () => [],
			createSSHKey: async () => {
				createCalls += 1;
				return { id: 123, name: "new", fingerprint: "new-fingerprint" };
			},
			listSSHKeys: async () => [
				{ id: 1, name: "other", fingerprint: "aa:bb:cc:dd" },
			],
			listDatacenters: async () => [],
		};

		const provider = new HetznerProvider(
			{ token: "token" },
			client,
			async () => {},
		);

		const keyID = await provider.ensureSSHKey("sandctl", TEST_PUBLIC_KEY);
		expect(keyID).toBe("123");
		expect(createCalls).toBe(1);
	});

	test("ensureSSHKey handles create race by re-listing keys", async () => {
		const fingerprint = calculateFingerprint(TEST_PUBLIC_KEY);
		let listCalls = 0;
		const client: HetznerClientLike = {
			createServer: async () => {
				throw new Error("not used");
			},
			getServer: async () => {
				throw new Error("not used");
			},
			deleteServer: async () => {},
			listServers: async () => [],
			createSSHKey: async () => {
				throw new Error("already exists");
			},
			listSSHKeys: async () => {
				listCalls += 1;
				if (listCalls === 1) {
					return [];
				}
				return [{ id: 456, name: "raced", fingerprint }];
			},
			listDatacenters: async () => [],
		};

		const provider = new HetznerProvider(
			{ token: "token" },
			client,
			async () => {},
		);

		const keyID = await provider.ensureSSHKey("sandctl", TEST_PUBLIC_KEY);

		expect(keyID).toBe("456");
		expect(listCalls).toBe(2);
	});
});
