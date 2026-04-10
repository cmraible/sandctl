import {
	ErrAuthFailed,
	ErrNotFound,
	ErrProvisionFailed,
	ErrQuotaExceeded,
} from "@/provider/errors";

const DEFAULT_BASE_URL = "https://api.digitalocean.com/v2";
const PAGE_SIZE = 200;

export interface DigitalOceanDroplet {
	id: number;
	name: string;
	status: string;
	locked?: boolean;
	created_at: string;
	networks?: {
		v4?: Array<{
			ip_address: string;
			type: string;
		}>;
	};
	region?: {
		slug: string;
	};
	size_slug?: string;
	vcpus?: number;
	memory?: number;
	disk?: number;
}

export interface CreateDropletOpts {
	name: string;
	region: string;
	size: string;
	image: string;
	ssh_keys?: Array<number | string>;
	user_data?: string;
	tags?: string[];
}

export interface DigitalOceanSSHKey {
	id: number;
	name: string;
	fingerprint: string;
	public_key?: string;
}

export interface DigitalOceanAction {
	id: number;
	status: string;
	type: string;
	resource_id?: number;
	resource_type?: string;
}

export interface DigitalOceanSnapshot {
	id: number;
	name: string;
	resource_id: string;
	resource_type: string;
	regions: string[];
	min_disk_size: number;
	size_gigabytes: number;
	created_at: string;
	tags?: string[] | null;
}

interface DigitalOceanErrorResponse {
	id?: string;
	message?: string;
}

export class DigitalOceanClient {
	constructor(
		private readonly token: string,
		private readonly baseURL = DEFAULT_BASE_URL,
	) {}

	async createDroplet(opts: CreateDropletOpts): Promise<DigitalOceanDroplet> {
		const response = await this.request<{ droplet: DigitalOceanDroplet }>(
			"/droplets",
			{
				method: "POST",
				body: JSON.stringify(opts),
			},
		);
		return response.droplet;
	}

	async getDroplet(id: string): Promise<DigitalOceanDroplet> {
		const response = await this.request<{ droplet: DigitalOceanDroplet }>(
			`/droplets/${id}`,
		);
		return response.droplet;
	}

	async deleteDroplet(id: string): Promise<void> {
		await this.request<void>(`/droplets/${id}`, { method: "DELETE" });
	}

	async listDroplets(tagName?: string): Promise<DigitalOceanDroplet[]> {
		return await this.paginate<DigitalOceanDroplet>("/droplets", "droplets", {
			tag_name: tagName,
		});
	}

	async createSSHKey(
		name: string,
		publicKey: string,
	): Promise<DigitalOceanSSHKey> {
		const response = await this.request<{ ssh_key: DigitalOceanSSHKey }>(
			"/account/keys",
			{
				method: "POST",
				body: JSON.stringify({ name, public_key: publicKey }),
			},
		);
		return response.ssh_key;
	}

	async listSSHKeys(): Promise<DigitalOceanSSHKey[]> {
		return await this.paginate<DigitalOceanSSHKey>("/account/keys", "ssh_keys");
	}

	async postDropletAction(
		dropletId: string,
		body: Record<string, unknown>,
	): Promise<DigitalOceanAction> {
		const response = await this.request<{ action: DigitalOceanAction }>(
			`/droplets/${dropletId}/actions`,
			{
				method: "POST",
				body: JSON.stringify(body),
			},
		);
		return response.action;
	}

	async getDropletAction(
		dropletId: string,
		actionId: string,
	): Promise<DigitalOceanAction> {
		const response = await this.request<{ action: DigitalOceanAction }>(
			`/droplets/${dropletId}/actions/${actionId}`,
		);
		return response.action;
	}

	async listSnapshots(
		resourceType = "droplet",
	): Promise<DigitalOceanSnapshot[]> {
		return await this.paginate<DigitalOceanSnapshot>(
			"/snapshots",
			"snapshots",
			{ resource_type: resourceType },
		);
	}

	async deleteSnapshot(id: string): Promise<void> {
		await this.request<void>(`/snapshots/${id}`, { method: "DELETE" });
	}

	private async paginate<T>(
		pathname: string,
		key: string,
		query?: Record<string, string | undefined>,
	): Promise<T[]> {
		const all: T[] = [];
		let page = 1;

		while (true) {
			const response = await this.request<Record<string, unknown>>(pathname, {
				query: {
					...query,
					page: String(page),
					per_page: String(PAGE_SIZE),
				},
			});
			const items = ((response[key] as T[] | undefined) ?? []).slice();
			all.push(...items);
			if (items.length < PAGE_SIZE) {
				return all;
			}
			page += 1;
		}
	}

	private async request<T>(
		pathname: string,
		options?: {
			method?: string;
			body?: string;
			query?: Record<string, string | undefined>;
		},
	): Promise<T> {
		const method = options?.method ?? "GET";
		const url = new URL(`${this.baseURL}${pathname}`);
		for (const [key, value] of Object.entries(options?.query ?? {})) {
			if (value !== undefined) {
				url.searchParams.set(key, value);
			}
		}

		let response: Response;
		try {
			response = await fetch(url, {
				method,
				headers: {
					Authorization: `Bearer ${this.token}`,
					"Content-Type": "application/json",
				},
				body: options?.body,
			});
		} catch (error) {
			throw new ErrProvisionFailed(
				`failed to call digitalocean api: ${method} ${url.pathname}`,
				{ cause: error },
			);
		}

		if (!response.ok) {
			const errorBody = (await response
				.json()
				.catch(() => ({}))) as DigitalOceanErrorResponse;
			const apiMessage =
				errorBody.message ?? `${response.status} ${response.statusText}`.trim();
			const code = errorBody.id;

			if (response.status === 401 || response.status === 403) {
				throw new ErrAuthFailed(apiMessage);
			}
			if (response.status === 404) {
				throw new ErrNotFound(apiMessage);
			}
			if (
				response.status === 429 ||
				(response.status === 422 && /(limit|quota)/i.test(apiMessage))
			) {
				throw new ErrQuotaExceeded(apiMessage);
			}

			throw new ErrProvisionFailed(
				code ? `${apiMessage} (${code})` : apiMessage,
			);
		}

		if (response.status === 204) {
			return undefined as T;
		}

		return (await response.json()) as T;
	}
}
