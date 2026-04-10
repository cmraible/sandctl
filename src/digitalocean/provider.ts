import { createHash } from "node:crypto";
import { Socket } from "node:net";

import type { ProviderConfig } from "@/config/config";
import {
	type CreateDropletOpts,
	type DigitalOceanAction,
	DigitalOceanClient,
	type DigitalOceanDroplet,
	type DigitalOceanSnapshot,
	type DigitalOceanSSHKey,
} from "@/digitalocean/client";
import { ensureSSHKey } from "@/digitalocean/ssh-keys";
import { generatePostSnapshotSSHSetup } from "@/provider/cloud-init";
import { ErrNotFound, ErrProvisionFailed, ErrTimeout } from "@/provider/errors";
import type {
	Provider,
	RenamableProvider,
	ResizableProvider,
	SnapshotCapableProvider,
	SSHKeyManager,
} from "@/provider/interface";
import type { CreateOpts, VM, VMStatus } from "@/provider/types";

const PROVIDER_NAME = "digitalocean";
const DEFAULT_REGION = "nyc1";
const DEFAULT_SIZE = "s-4vcpu-8gb";
const DEFAULT_IMAGE = "ubuntu-24-04-x64";
const MANAGED_TAG = "managed-by:sandctl";
const SNAPSHOT_NAME_PREFIX = "sandctl-base-v";
const POLL_INTERVAL_MS = 5_000;
const SNAPSHOT_TIMEOUT_MS = 5 * 60 * 1000;
const ACTION_TIMEOUT_MS = 10 * 60 * 1000;
const SSH_PORT = 22;
const SSH_PROBE_TIMEOUT_MS = 2_000;
const SSH_PROBE_RETRIES = 3;
const SSH_RETRY_DELAY_MS = 1_000;

export interface DigitalOceanClientLike {
	createDroplet(opts: CreateDropletOpts): Promise<DigitalOceanDroplet>;
	getDroplet(id: string): Promise<DigitalOceanDroplet>;
	deleteDroplet(id: string): Promise<void>;
	listDroplets(tagName?: string): Promise<DigitalOceanDroplet[]>;
	createSSHKey(name: string, publicKey: string): Promise<DigitalOceanSSHKey>;
	listSSHKeys(): Promise<DigitalOceanSSHKey[]>;
	postDropletAction(
		dropletId: string,
		body: Record<string, unknown>,
	): Promise<DigitalOceanAction>;
	getDropletAction(
		dropletId: string,
		actionId: string,
	): Promise<DigitalOceanAction>;
	listSnapshots(resourceType?: string): Promise<DigitalOceanSnapshot[]>;
	deleteSnapshot(id: string): Promise<void>;
}

export class DigitalOceanProvider
	implements
		Provider,
		SSHKeyManager,
		ResizableProvider,
		RenamableProvider,
		SnapshotCapableProvider
{
	readonly client: DigitalOceanClientLike;

	constructor(
		private readonly config: ProviderConfig,
		client?: DigitalOceanClientLike,
		private readonly sleep: (ms: number) => Promise<void> = (ms) =>
			new Promise((resolve) => setTimeout(resolve, ms)),
		private readonly probeTCP: (
			host: string,
			port: number,
			timeoutMs: number,
		) => Promise<boolean> = defaultProbeTCP,
		private readonly now: () => number = () => performance.now(),
	) {
		this.client = client ?? new DigitalOceanClient(config.token);
	}

	name(): string {
		return PROVIDER_NAME;
	}

	async create(opts: CreateOpts): Promise<VM> {
		const droplet = await this.client.createDroplet({
			name: opts.name,
			region: opts.region ?? this.config.region ?? DEFAULT_REGION,
			size: opts.serverType ?? this.config.server_type ?? DEFAULT_SIZE,
			image: opts.image ?? this.config.image ?? DEFAULT_IMAGE,
			ssh_keys: (opts.sshKeyIDs ?? []).map(coerceSSHKeyIdentifier),
			tags: [MANAGED_TAG],
			user_data:
				!opts.skipUserData && opts.userData ? opts.userData : undefined,
		});

		return mapDroplet(droplet);
	}

	async get(id: string): Promise<VM> {
		return mapDroplet(await this.client.getDroplet(id));
	}

	async delete(id: string): Promise<void> {
		try {
			await this.client.deleteDroplet(id);
		} catch (error) {
			if (error instanceof ErrNotFound) {
				return;
			}
			throw error;
		}
	}

	async reboot(id: string): Promise<void> {
		await this.client.postDropletAction(id, { type: "reboot" });
	}

	async rename(id: string, name: string): Promise<void> {
		const action = await this.client.postDropletAction(id, {
			type: "rename",
			name,
		});
		await this.waitForAction(id, String(action.id), ACTION_TIMEOUT_MS);
	}

	async resize(
		id: string,
		serverType: string,
		upgradeDisk = false,
		onProgress?: (message: string) => void,
	): Promise<void> {
		const log = onProgress ?? (() => {});

		const droplet = await this.client.getDroplet(id);
		if (droplet.status !== "off") {
			log("Powering off server...");
			const powerOff = await this.client.postDropletAction(id, {
				type: "power_off",
			});
			await this.waitForAction(id, String(powerOff.id), ACTION_TIMEOUT_MS);
			await this.waitForDropletStatus(id, "off", ACTION_TIMEOUT_MS);
		}

		log(`Changing server type to ${serverType}...`);
		const resize = await this.client.postDropletAction(id, {
			type: "resize",
			size: serverType,
			disk: upgradeDisk,
		});
		await this.waitForAction(id, String(resize.id), ACTION_TIMEOUT_MS);

		log("Powering on server...");
		const powerOn = await this.client.postDropletAction(id, {
			type: "power_on",
		});
		await this.waitForAction(id, String(powerOn.id), ACTION_TIMEOUT_MS);
		await this.waitForDropletStatus(id, "active", ACTION_TIMEOUT_MS);
	}

	async list(): Promise<VM[]> {
		const droplets = await this.client.listDroplets(MANAGED_TAG);
		return droplets.map(mapDroplet);
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

	async findSnapshot(userData: string): Promise<{ id: string } | null> {
		const expectedName = snapshotName(userData);
		const snapshots = await this.client.listSnapshots("droplet");
		const match = snapshots.find((snapshot) => snapshot.name === expectedName);
		return match ? { id: String(match.id) } : null;
	}

	async createSnapshot(
		serverId: string,
		userData: string,
	): Promise<{ id: string }> {
		const name = snapshotName(userData);
		const action = await this.client.postDropletAction(serverId, {
			type: "snapshot",
			name,
		});
		await this.waitForAction(serverId, String(action.id), SNAPSHOT_TIMEOUT_MS);

		const deadline = this.now() + SNAPSHOT_TIMEOUT_MS;
		while (this.now() < deadline) {
			const snapshots = await this.client.listSnapshots("droplet");
			const match = snapshots.find(
				(snapshot) =>
					snapshot.name === name && String(snapshot.resource_id) === serverId,
			);
			if (match) {
				return { id: String(match.id) };
			}
			await this.sleep(POLL_INTERVAL_MS);
		}

		throw new ErrTimeout(
			`timed out waiting for snapshot of droplet ${serverId}`,
		);
	}

	async cleanupSnapshots(userData: string): Promise<void> {
		const currentName = snapshotName(userData);
		const snapshots = await this.client.listSnapshots("droplet");

		for (const snapshot of snapshots) {
			if (
				snapshot.name.startsWith(SNAPSHOT_NAME_PREFIX) &&
				snapshot.name !== currentName
			) {
				await this.client.deleteSnapshot(String(snapshot.id));
			}
		}
	}

	postSnapshotSSHSetupCommand(): string {
		return generatePostSnapshotSSHSetup();
	}

	ensureSSHKey(name: string, publicKey: string): Promise<string> {
		return ensureSSHKey(this.client, name, publicKey);
	}

	private async waitForAction(
		dropletId: string,
		actionId: string,
		timeoutMs: number,
	): Promise<void> {
		const deadline = this.now() + timeoutMs;

		while (this.now() < deadline) {
			const action = await this.client.getDropletAction(dropletId, actionId);
			if (action.status === "completed") {
				return;
			}
			if (action.status === "errored") {
				throw new ErrProvisionFailed(
					`action ${actionId} failed for droplet ${dropletId}`,
				);
			}

			const delay = Math.min(
				POLL_INTERVAL_MS,
				Math.max(0, deadline - this.now()),
			);
			if (delay <= 0) {
				break;
			}
			await this.sleep(delay);
		}

		throw new ErrTimeout(
			`timed out waiting for action ${actionId} on droplet ${dropletId}`,
		);
	}

	private async waitForDropletStatus(
		id: string,
		desiredStatus: string,
		timeoutMs: number,
	): Promise<void> {
		const deadline = this.now() + timeoutMs;

		while (this.now() < deadline) {
			const droplet = await this.client.getDroplet(id);
			if (droplet.status === desiredStatus) {
				return;
			}

			const delay = Math.min(
				POLL_INTERVAL_MS,
				Math.max(0, deadline - this.now()),
			);
			if (delay <= 0) {
				break;
			}
			await this.sleep(delay);
		}

		throw new ErrTimeout(
			`timed out waiting for droplet ${id} to reach status '${desiredStatus}'`,
		);
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
}

function coerceSSHKeyIdentifier(id: string): number | string {
	if (/^\d+$/.test(id)) {
		return Number(id);
	}
	return id;
}

function snapshotName(userData: string): string {
	return `${SNAPSHOT_NAME_PREFIX}${createHash("sha256").update(userData).digest("hex").slice(0, 12)}`;
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
		case "new":
			return "provisioning";
		case "active":
			return "running";
		case "off":
		case "archive":
			return "stopped";
		default:
			return "failed";
	}
}

function publicIPv4(droplet: DigitalOceanDroplet): string | null {
	return (
		droplet.networks?.v4?.find((network) => network.type === "public")
			?.ip_address ?? null
	);
}

function mapDroplet(droplet: DigitalOceanDroplet): VM {
	return {
		id: String(droplet.id),
		name: droplet.name,
		status: mapStatus(droplet.status),
		ipAddress: publicIPv4(droplet),
		region: droplet.region?.slug ?? DEFAULT_REGION,
		serverType: droplet.size_slug ?? DEFAULT_SIZE,
		createdAt: droplet.created_at,
		cores: droplet.vcpus,
		memoryGB:
			typeof droplet.memory === "number" ? droplet.memory / 1024 : undefined,
		diskGB: droplet.disk,
	};
}
