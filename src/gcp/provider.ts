import { Socket } from "node:net";
import * as compute from "@google-cloud/compute";
import type { ProviderConfig } from "@/config/config";
import {
	ErrAuthFailed,
	ErrNotFound,
	ErrProvisionFailed,
	ErrQuotaExceeded,
	ErrTimeout,
} from "@/provider/errors";
import type { Provider, SSHKeyManager } from "@/provider/interface";
import type { CreateOpts, VM, VMStatus } from "@/provider/types";
import { expandTilde } from "@/utils/paths";

const PROVIDER_NAME = "gcp";
const DEFAULT_ZONE = "us-central1-a";
const DEFAULT_MACHINE_TYPE = "e2-standard-4";
const DEFAULT_IMAGE =
	"projects/ubuntu-os-cloud/global/images/family/ubuntu-2404-lts-amd64";
const DEFAULT_DISK_SIZE_GB = 50;
const DEFAULT_NETWORK = "global/networks/default";
const MANAGED_LABEL_KEY = "managed-by";
const MANAGED_LABEL_VALUE = "sandctl";
const POLL_INTERVAL_MS = 5_000;
const OPERATION_TIMEOUT_MS = 5 * 60 * 1000;
const SSH_PORT = 22;
const SSH_PROBE_TIMEOUT_MS = 2_000;
const SSH_PROBE_RETRIES = 3;
const SSH_RETRY_DELAY_MS = 1_000;

type GcpOperation = {
	name?: string | null;
	status?: string | null;
	zone?: string | null;
	error?: {
		errors?: Array<{ message?: string | null }>;
	};
};

export interface GcpInstance {
	id?: string | number | null;
	name?: string | null;
	status?: string | null;
	creationTimestamp?: string | null;
	zone?: string | null;
	machineType?: string | null;
	networkInterfaces?: Array<{
		networkIP?: string | null;
		accessConfigs?: Array<{ natIP?: string | null }>;
	}>;
	disks?: Array<{
		boot?: boolean | null;
		diskSizeGb?: string | number | null;
	}>;
}

export interface GcpClientLike {
	insertInstance(opts: {
		project: string;
		zone: string;
		instanceResource: Record<string, unknown>;
		debug?: (message: string) => void;
	}): Promise<GcpOperation>;
	getInstance(
		project: string,
		zone: string,
		name: string,
	): Promise<GcpInstance>;
	deleteInstance(
		project: string,
		zone: string,
		name: string,
	): Promise<GcpOperation>;
	resetInstance(
		project: string,
		zone: string,
		name: string,
	): Promise<GcpOperation>;
	listInstances(
		project: string,
		zone: string,
		filter?: string,
	): Promise<GcpInstance[]>;
	waitZoneOperation(
		project: string,
		zone: string,
		operation: string,
	): Promise<GcpOperation>;
}

export class GcpProvider implements Provider, SSHKeyManager {
	readonly client: GcpClientLike;

	constructor(
		private readonly config: ProviderConfig,
		client?: GcpClientLike,
		private readonly sleep: (ms: number) => Promise<void> = (ms) =>
			new Promise((resolve) => setTimeout(resolve, ms)),
		private readonly probeTCP: (
			host: string,
			port: number,
			timeoutMs: number,
		) => Promise<boolean> = defaultProbeTCP,
		private readonly now: () => number = () => performance.now(),
		private readonly operationTimeoutMs: number = OPERATION_TIMEOUT_MS,
	) {
		this.client = client ?? new GcpComputeClient(config);
	}

	name(): string {
		return PROVIDER_NAME;
	}

	async create(opts: CreateOpts): Promise<VM> {
		const debug = opts.debug ?? (() => {});
		const project = this.projectID();
		const zone = opts.region ?? this.config.region ?? DEFAULT_ZONE;
		const machineType =
			opts.serverType ?? this.config.server_type ?? DEFAULT_MACHINE_TYPE;
		const image = opts.image ?? this.config.image ?? DEFAULT_IMAGE;
		const metadataItems = metadataItemsForCreate(opts);

		debug(
			`gcp create: project=${project} zone=${zone} name=${opts.name} machineType=${machineType} image=${image}`,
		);
		debug(
			`gcp create: metadata=${metadataItems.map((item) => item.key).join(",") || "<none>"} sshKeys=${opts.sshKeyIDs?.length ?? 0} userData=${opts.skipUserData ? "skipped" : opts.userData ? `${opts.userData.length} bytes` : "absent"}`,
		);
		const operation = await this.client.insertInstance({
			project,
			zone,
			debug,
			instanceResource: {
				name: opts.name,
				labels: {
					[MANAGED_LABEL_KEY]: MANAGED_LABEL_VALUE,
				},
				disks: [
					{
						autoDelete: true,
						boot: true,
						type: "PERSISTENT",
						initializeParams: {
							diskSizeGb: String(
								this.config.disk_size_gb ?? DEFAULT_DISK_SIZE_GB,
							),
							sourceImage: image,
						},
					},
				],
				machineType: `zones/${zone}/machineTypes/${machineType}`,
				networkInterfaces: [
					{
						network: this.config.network ?? DEFAULT_NETWORK,
						accessConfigs: [{ name: "External NAT", type: "ONE_TO_ONE_NAT" }],
					},
				],
				...(metadataItems.length > 0
					? { metadata: { items: metadataItems } }
					: {}),
			},
		});
		debug(
			`gcp create: insert operation name=${operation.name ?? "<none>"} status=${operation.status ?? "<unknown>"}`,
		);
		await this.waitForOperation(project, zone, operation, debug);
		debug(`gcp create: fetching instance ${zone}/${opts.name}`);
		const instance = await this.client.getInstance(project, zone, opts.name);
		const vm = mapInstance(instance, zone);
		debug(
			`gcp create: instance id=${vm.id} status=${vm.status} ip=${vm.ipAddress ?? "<none>"}`,
		);
		return vm;
	}

	async get(id: string): Promise<VM> {
		const { zone, name } = this.parseInstanceID(id);
		return mapInstance(
			await this.client.getInstance(this.projectID(), zone, name),
			zone,
		);
	}

	async delete(id: string): Promise<void> {
		const project = this.projectID();
		const { zone, name } = this.parseInstanceID(id);
		try {
			const operation = await this.client.deleteInstance(project, zone, name);
			await this.waitForOperation(project, zone, operation);
		} catch (error) {
			if (error instanceof ErrNotFound) {
				return;
			}
			throw error;
		}
	}

	async reboot(id: string): Promise<void> {
		const project = this.projectID();
		const { zone, name } = this.parseInstanceID(id);
		const operation = await this.client.resetInstance(project, zone, name);
		await this.waitForOperation(project, zone, operation);
	}

	async list(): Promise<VM[]> {
		const zone = this.config.region ?? DEFAULT_ZONE;
		const instances = await this.client.listInstances(
			this.projectID(),
			zone,
			`labels.${MANAGED_LABEL_KEY} = ${MANAGED_LABEL_VALUE}`,
		);
		return instances.map((instance) => mapInstance(instance, zone));
	}

	async waitReady(
		id: string,
		timeoutMs: number,
		debug: (message: string) => void = () => {},
	): Promise<void> {
		const deadline = this.now() + timeoutMs;
		const remaining = (): number => deadline - this.now();
		let poll = 0;

		while (remaining() > 0) {
			poll += 1;
			let vm: VM;
			try {
				vm = await this.get(id);
			} catch (error: unknown) {
				if (error instanceof ErrNotFound) {
					throw new ErrProvisionFailed(`vm not found while waiting: ${id}`);
				}

				debug(
					`gcp waitReady: poll=${poll} get failed (${messageFromError(error)}), retrying`,
				);
				const delay = Math.min(POLL_INTERVAL_MS, Math.max(0, remaining()));
				if (delay <= 0) {
					break;
				}

				await this.sleep(delay);
				continue;
			}

			debug(
				`gcp waitReady: poll=${poll} status=${vm.status} ip=${vm.ipAddress ?? "<none>"}`,
			);
			if (vm.status === "failed") {
				throw new ErrProvisionFailed(`vm entered failed state: ${id}`);
			}

			if (vm.status === "running" && vm.ipAddress) {
				const sshReady = await this.waitForSSH(vm.ipAddress, deadline, debug);
				if (sshReady) {
					debug(`gcp waitReady: ssh reachable at ${vm.ipAddress}:22`);
					return;
				}
				debug(`gcp waitReady: ssh not reachable yet at ${vm.ipAddress}:22`);
			}

			const delay = Math.min(POLL_INTERVAL_MS, Math.max(0, remaining()));
			if (delay <= 0) {
				break;
			}
			await this.sleep(delay);
		}

		throw new ErrTimeout(`timed out waiting for vm ${id} to become ready`);
	}

	async ensureSSHKey(_name: string, publicKey: string): Promise<string> {
		return publicKey.trim();
	}

	private projectID(): string {
		if (!this.config.project_id) {
			throw new Error("gcp provider requires project_id");
		}
		return this.config.project_id;
	}

	private parseInstanceID(id: string): { zone: string; name: string } {
		const [zone, name] = id.includes("/")
			? id.split("/", 2)
			: [this.config.region ?? DEFAULT_ZONE, id];
		return { zone, name };
	}

	private async waitForOperation(
		project: string,
		zone: string,
		operation: GcpOperation,
		debug: (message: string) => void = () => {},
	): Promise<void> {
		if (!operation.name) {
			debug("gcp operation: no operation name returned; skipping wait");
			return;
		}

		const deadline = this.now() + this.operationTimeoutMs;
		let current = operation;
		let poll = 0;
		while (current.status !== "DONE") {
			poll += 1;
			const remaining = deadline - this.now();
			if (remaining <= 0) {
				break;
			}

			debug(
				`gcp operation: waiting name=${operation.name} poll=${poll} previousStatus=${current.status ?? "<unknown>"}`,
			);
			current = await this.withTimeout(
				this.client.waitZoneOperation(project, zone, operation.name),
				remaining,
				`timed out waiting for gcp operation ${operation.name} in zone ${zone}`,
			);
			debug(
				`gcp operation: response name=${operation.name} poll=${poll} status=${current.status ?? "<unknown>"}`,
			);

			if (current.status !== "DONE") {
				const delay = Math.min(
					POLL_INTERVAL_MS,
					Math.max(0, deadline - this.now()),
				);
				if (delay <= 0) {
					break;
				}
				await this.sleep(delay);
			}
		}

		if (current.status !== "DONE") {
			throw new ErrTimeout(
				`timed out waiting for gcp operation ${operation.name} in zone ${zone}`,
			);
		}

		const message = current.error?.errors
			?.map((err) => err.message)
			.filter(Boolean)
			.join("; ");
		if (message) {
			throw new ErrProvisionFailed(message);
		}
	}

	private async withTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number,
		message: string,
	): Promise<T> {
		if (timeoutMs <= 0) {
			throw new ErrTimeout(message);
		}

		let timeout: ReturnType<typeof setTimeout> | undefined;
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeout = setTimeout(() => reject(new ErrTimeout(message)), timeoutMs);
		});

		try {
			return await Promise.race([promise, timeoutPromise]);
		} finally {
			if (timeout) {
				clearTimeout(timeout);
			}
		}
	}

	private async waitForSSH(
		host: string,
		deadline: number,
		debug: (message: string) => void = () => {},
	): Promise<boolean> {
		for (let attempt = 0; attempt < SSH_PROBE_RETRIES; attempt++) {
			const probeBudget = deadline - this.now();
			if (probeBudget <= 0) {
				return false;
			}

			const timeout = Math.min(SSH_PROBE_TIMEOUT_MS, probeBudget);
			const attemptNumber = attempt + 1;
			debug(
				`gcp waitReady: probing ssh ${host}:22 attempt=${attemptNumber}/${SSH_PROBE_RETRIES} timeoutMs=${Math.round(timeout)}`,
			);
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

			await this.sleep(Math.min(SSH_RETRY_DELAY_MS, retryBudget));
		}

		return false;
	}
}

class GcpComputeClient implements GcpClientLike {
	private readonly instancesClient: InstanceClientApi;
	private readonly operationsClient: ZoneOperationsClientApi;

	constructor(config: ProviderConfig) {
		const clientOptions = {
			fallback: true,
			...(config.project_id ? { projectId: config.project_id } : {}),
			...(config.credentials_file
				? { keyFilename: expandTilde(config.credentials_file) }
				: {}),
		};
		const computeModule = compute as unknown as {
			InstancesClient: new (
				opts?: Record<string, unknown>,
			) => InstanceClientApi;
			ZoneOperationsClient: new (
				opts?: Record<string, unknown>,
			) => ZoneOperationsClientApi;
		};
		this.instancesClient = new computeModule.InstancesClient(clientOptions);
		this.operationsClient = new computeModule.ZoneOperationsClient(
			clientOptions,
		);
	}

	async insertInstance(opts: {
		project: string;
		zone: string;
		instanceResource: Record<string, unknown>;
		debug?: (message: string) => void;
	}): Promise<GcpOperation> {
		const debug = opts.debug ?? (() => {});
		debug("gcp api: initializing instances client");
		await this.call(() => this.instancesClient.initialize());
		debug("gcp api: instances client initialized");
		debug("gcp api: sending instances.insert request");
		return unwrapOperation(
			await this.call(() =>
				this.instancesClient.insert({
					project: opts.project,
					zone: opts.zone,
					instanceResource: opts.instanceResource,
				}),
			),
		);
	}

	async getInstance(
		project: string,
		zone: string,
		name: string,
	): Promise<GcpInstance> {
		const [instance] = await this.call(() =>
			this.instancesClient.get({ project, zone, instance: name }),
		);
		return instance as GcpInstance;
	}

	async deleteInstance(
		project: string,
		zone: string,
		name: string,
	): Promise<GcpOperation> {
		return unwrapOperation(
			await this.call(() =>
				this.instancesClient.delete({ project, zone, instance: name }),
			),
		);
	}

	async resetInstance(
		project: string,
		zone: string,
		name: string,
	): Promise<GcpOperation> {
		return unwrapOperation(
			await this.call(() =>
				this.instancesClient.reset({ project, zone, instance: name }),
			),
		);
	}

	async listInstances(
		project: string,
		zone: string,
		filter?: string,
	): Promise<GcpInstance[]> {
		const [instances] = await this.call(() =>
			this.instancesClient.list({ project, zone, filter }),
		);
		return (instances ?? []) as GcpInstance[];
	}

	async waitZoneOperation(
		project: string,
		zone: string,
		operation: string,
	): Promise<GcpOperation> {
		const [result] = await this.call(() =>
			this.operationsClient.wait({ project, zone, operation }),
		);
		return result as GcpOperation;
	}

	private async call<T>(fn: () => Promise<T>): Promise<T> {
		try {
			return await fn();
		} catch (error) {
			throw mapGcpError(error);
		}
	}
}

interface InstanceClientApi {
	insert(opts: Record<string, unknown>): Promise<unknown[]>;
	get(opts: Record<string, unknown>): Promise<unknown[]>;
	delete(opts: Record<string, unknown>): Promise<unknown[]>;
	reset(opts: Record<string, unknown>): Promise<unknown[]>;
	list(opts: Record<string, unknown>): Promise<unknown[]>;
}

interface ZoneOperationsClientApi {
	wait(opts: Record<string, unknown>): Promise<unknown[]>;
}

function metadataItemsForCreate(
	opts: CreateOpts,
): Array<{ key: string; value: string }> {
	const items: Array<{ key: string; value: string }> = [];

	if (opts.sshKeyIDs?.length) {
		const lines: string[] = [];
		for (const key of opts.sshKeyIDs) {
			lines.push(`root:${key}`);
			lines.push(`agent:${key}`);
		}
		items.push({
			key: "ssh-keys",
			value: lines.join("\n"),
		});
	}

	if (!opts.skipUserData && opts.userData) {
		items.push({ key: "user-data", value: opts.userData });
	}

	return items;
}

function unwrapOperation(response: unknown[]): GcpOperation {
	const first = response[0] as { latestResponse?: GcpOperation } | GcpOperation;
	const maybeWrapped = first as { latestResponse?: GcpOperation };
	if (maybeWrapped.latestResponse !== undefined) {
		return maybeWrapped.latestResponse;
	}
	return first as GcpOperation;
}

function mapGcpError(error: unknown): Error {
	const code =
		typeof error === "object" && error
			? (error as { code?: number }).code
			: undefined;
	const message =
		error instanceof Error
			? error.message
			: `gcp api request failed: ${String(error)}`;

	if (code === 5) {
		return new ErrNotFound(message);
	}
	if (code === 7 || code === 16) {
		return new ErrAuthFailed(message);
	}
	if (code === 8) {
		return new ErrQuotaExceeded(message);
	}
	return new ErrProvisionFailed(
		message,
		error instanceof Error ? { cause: error } : undefined,
	);
}

function messageFromError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
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

function mapStatus(status?: string | null): VMStatus {
	switch (status) {
		case "PROVISIONING":
		case "STAGING":
			return "provisioning";
		case "RUNNING":
			return "running";
		case "STOPPING":
		case "SUSPENDING":
			return "stopping";
		case "TERMINATED":
		case "SUSPENDED":
			return "stopped";
		default:
			return "failed";
	}
}

function basename(selfLink?: string | null): string | undefined {
	return selfLink?.split("/").filter(Boolean).at(-1);
}

function publicIPv4(instance: GcpInstance): string | null {
	return (
		instance.networkInterfaces
			?.find((network) => network.accessConfigs?.length)
			?.accessConfigs?.find((config) => config.natIP)?.natIP ?? null
	);
}

function bootDiskGB(instance: GcpInstance): number | undefined {
	const value = instance.disks?.find((disk) => disk.boot)?.diskSizeGb;
	if (value === undefined || value === null) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function mapInstance(instance: GcpInstance, fallbackZone: string): VM {
	const serverType = basename(instance.machineType) ?? DEFAULT_MACHINE_TYPE;
	const zone = basename(instance.zone) ?? fallbackZone;
	const name = instance.name ?? String(instance.id ?? "");

	return {
		id: `${zone}/${name}`,
		name,
		status: mapStatus(instance.status),
		ipAddress: publicIPv4(instance),
		region: zone,
		serverType,
		createdAt: instance.creationTimestamp ?? new Date(0).toISOString(),
		cores: machineTypeCores(serverType),
		memoryGB: machineTypeMemoryGB(serverType),
		diskGB: bootDiskGB(instance),
	};
}

function machineTypeCores(machineType: string): number | undefined {
	const match = /-(\d+)$/.exec(machineType);
	return match ? Number(match[1]) : undefined;
}

function machineTypeMemoryGB(machineType: string): number | undefined {
	const cores = machineTypeCores(machineType);
	if (cores === undefined) {
		return undefined;
	}
	if (machineType.startsWith("e2-highmem-")) {
		return cores * 8;
	}
	if (machineType.startsWith("e2-highcpu-")) {
		return cores;
	}
	return cores * 4;
}
