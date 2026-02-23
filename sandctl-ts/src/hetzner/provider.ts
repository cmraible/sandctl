import { Socket } from "node:net";
import type { ProviderConfig } from "@/config/config";
import {
	type CreateServerOpts,
	HetznerClient,
	type HetznerServer,
	type HetznerSSHKey,
} from "@/hetzner/client";
import {
	DEFAULT_IMAGE,
	DEFAULT_REGION,
	DEFAULT_SERVER_TYPE,
	generateCloudInit,
} from "@/hetzner/setup";
import { ensureSSHKey } from "@/hetzner/ssh-keys";
import { ErrNotFound, ErrProvisionFailed, ErrTimeout } from "@/provider/errors";
import type { Provider, SSHKeyManager } from "@/provider/interface";
import type { CreateOpts, VM, VMStatus } from "@/provider/types";

const PROVIDER_NAME = "hetzner";
const POLL_INTERVAL_MS = 5_000;
const SSH_PORT = 22;
const SSH_PROBE_TIMEOUT_MS = 2_000;
const SSH_PROBE_RETRIES = 3;
const SSH_RETRY_DELAY_MS = 1_000;

export interface HetznerClientLike {
	createServer(opts: CreateServerOpts): Promise<HetznerServer>;
	getServer(id: string): Promise<HetznerServer>;
	deleteServer(id: string): Promise<void>;
	listServers(labelSelector?: string): Promise<HetznerServer[]>;
	createSSHKey(name: string, publicKey: string): Promise<HetznerSSHKey>;
	listSSHKeys(fingerprint?: string): Promise<HetznerSSHKey[]>;
	listDatacenters(): Promise<Array<{ id: number; name: string }>>;
}

export class HetznerProvider implements Provider, SSHKeyManager {
	private readonly client: HetznerClientLike;

	constructor(
		private readonly config: ProviderConfig,
		client?: HetznerClientLike,
		private readonly sleep: (ms: number) => Promise<void> = (ms) =>
			new Promise((resolve) => setTimeout(resolve, ms)),
		private readonly probeTCP: (
			host: string,
			port: number,
			timeoutMs: number,
		) => Promise<boolean> = defaultProbeTCP,
		private readonly now: () => number = () => performance.now(),
	) {
		this.client = client ?? new HetznerClient(config.token);
	}

	name(): string {
		return PROVIDER_NAME;
	}

	async create(opts: CreateOpts): Promise<VM> {
		const sshKeyIDs = (opts.sshKeyIDs ?? []).map((id) => {
			if (!/^\d+$/.test(id)) {
				throw new Error(`invalid ssh key id: ${id}`);
			}

			const parsed = Number(id);
			if (!Number.isSafeInteger(parsed)) {
				throw new Error(`invalid ssh key id: ${id}`);
			}

			return parsed;
		});

		const server = await this.client.createServer({
			name: opts.name,
			location: opts.region ?? this.config.region ?? DEFAULT_REGION,
			server_type:
				opts.serverType ?? this.config.server_type ?? DEFAULT_SERVER_TYPE,
			image: opts.image ?? this.config.image ?? DEFAULT_IMAGE,
			ssh_keys: sshKeyIDs,
			user_data: opts.userData ?? generateCloudInit(),
			labels: {
				"managed-by": "sandctl",
			},
		});

		return mapServer(server);
	}

	async get(id: string): Promise<VM> {
		return mapServer(await this.client.getServer(id));
	}

	async delete(id: string): Promise<void> {
		try {
			await this.client.deleteServer(id);
		} catch (error) {
			if (error instanceof ErrNotFound) {
				return;
			}
			throw error;
		}
	}

	async list(): Promise<VM[]> {
		const servers = await this.client.listServers("managed-by=sandctl");
		return servers.map(mapServer);
	}

	async waitReady(id: string, timeoutMs: number): Promise<void> {
		const deadline = this.now() + timeoutMs;
		const remaining = (): number => deadline - this.now();

		while (remaining() > 0) {
			let vm: VM;
			try {
				vm = await this.get(id);
			} catch (error: unknown) {
				if (error instanceof ErrNotFound) {
					throw new ErrProvisionFailed(`vm not found while waiting: ${id}`);
				}

				const delay = Math.min(POLL_INTERVAL_MS, Math.max(0, remaining()));
				if (delay <= 0) {
					break;
				}

				await this.sleep(delay);
				continue;
			}

			if (!vm) {
				continue;
			}

			if (vm.status === "failed") {
				throw new ErrProvisionFailed(`vm entered failed state: ${id}`);
			}

			if (vm.status === "running" && vm.ipAddress) {
				const sshReady = await this.waitForSSH(vm.ipAddress, deadline);
				if (sshReady) {
					return;
				}
			}

			const delay = Math.min(POLL_INTERVAL_MS, Math.max(0, remaining()));
			if (delay <= 0) {
				break;
			}

			await this.sleep(delay);
		}

		throw new ErrTimeout(`timed out waiting for vm ${id} to become ready`);
	}

	private async waitForSSH(host: string, deadline: number): Promise<boolean> {
		for (let attempt = 0; attempt < SSH_PROBE_RETRIES; attempt++) {
			const probeBudget = deadline - this.now();
			if (probeBudget <= 0) {
				return false;
			}

			const timeout = Math.min(SSH_PROBE_TIMEOUT_MS, probeBudget);
			if (await this.probeTCP(host, SSH_PORT, timeout)) {
				if (this.now() > deadline) {
					return false;
				}
				return true;
			}

			if (attempt === SSH_PROBE_RETRIES - 1) {
				break;
			}

			const retryBudget = deadline - this.now();
			if (retryBudget <= 0) {
				break;
			}

			const retryDelay = Math.min(SSH_RETRY_DELAY_MS, retryBudget);
			await this.sleep(retryDelay);
		}

		return false;
	}

	ensureSSHKey(name: string, publicKey: string): Promise<string> {
		return ensureSSHKey(this.client, name, publicKey);
	}
}

async function defaultProbeTCP(
	host: string,
	port: number,
	timeoutMs: number,
): Promise<boolean> {
	if (timeoutMs <= 0) {
		return false;
	}

	return await new Promise<boolean>((resolve) => {
		const socket = new Socket();
		let settled = false;

		const finish = (result: boolean): void => {
			if (settled) {
				return;
			}
			settled = true;
			socket.destroy();
			resolve(result);
		};

		socket.once("connect", () => finish(true));
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
		socket.setTimeout(timeoutMs);
		socket.connect(port, host);
	});
}

function mapStatus(status: string): VMStatus {
	switch (status) {
		case "initializing":
			return "provisioning";
		case "starting":
			return "starting";
		case "running":
			return "running";
		case "stopping":
			return "stopping";
		case "off":
			return "stopped";
		case "deleting":
			return "deleting";
		default:
			return "failed";
	}
}

function mapServer(server: HetznerServer): VM {
	return {
		id: String(server.id),
		name: server.name,
		status: mapStatus(server.status),
		ipAddress: server.public_net?.ipv4?.ip ?? null,
		region: server.datacenter?.location?.name ?? DEFAULT_REGION,
		serverType: server.server_type?.name ?? DEFAULT_SERVER_TYPE,
		createdAt: server.created,
	};
}
