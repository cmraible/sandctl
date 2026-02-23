import {
	ErrAuthFailed,
	ErrNotFound,
	ErrProvisionFailed,
	ErrQuotaExceeded,
} from "@/provider/errors";

const DEFAULT_BASE_URL = "https://api.hetzner.cloud/v1";

export interface HetznerServer {
	id: number;
	name: string;
	status: string;
	created: string;
	public_net?: {
		ipv4?: {
			ip: string | null;
		} | null;
	};
	server_type?: { name: string };
	datacenter?: { location?: { name: string } };
}

export interface HetznerSSHKey {
	id: number;
	name: string;
	fingerprint: string;
}

export interface CreateServerOpts {
	name: string;
	location: string;
	server_type: string;
	image: string;
	ssh_keys?: number[];
	user_data?: string;
	labels?: Record<string, string>;
}

interface HetznerErrorResponse {
	error?: {
		code?: string;
		message?: string;
	};
}

export class HetznerClient {
	constructor(
		private readonly token: string,
		private readonly baseURL = DEFAULT_BASE_URL,
	) {}

	async createServer(opts: CreateServerOpts): Promise<HetznerServer> {
		const response = await this.request<{ server: HetznerServer }>("/servers", {
			method: "POST",
			body: JSON.stringify(opts),
		});
		return response.server;
	}

	async getServer(id: string): Promise<HetznerServer> {
		const response = await this.request<{ server: HetznerServer }>(
			`/servers/${id}`,
		);
		return response.server;
	}

	async deleteServer(id: string): Promise<void> {
		await this.request<void>(`/servers/${id}`, { method: "DELETE" });
	}

	async listServers(labelSelector?: string): Promise<HetznerServer[]> {
		const response = await this.request<{ servers: HetznerServer[] }>(
			"/servers",
			{
				query: labelSelector ? { label_selector: labelSelector } : undefined,
			},
		);
		return response.servers;
	}

	async createSSHKey(name: string, publicKey: string): Promise<HetznerSSHKey> {
		const response = await this.request<{ ssh_key: HetznerSSHKey }>(
			"/ssh_keys",
			{
				method: "POST",
				body: JSON.stringify({ name, public_key: publicKey }),
			},
		);
		return response.ssh_key;
	}

	async listSSHKeys(fingerprint?: string): Promise<HetznerSSHKey[]> {
		const response = await this.request<{ ssh_keys: HetznerSSHKey[] }>(
			"/ssh_keys",
			{
				query: fingerprint ? { fingerprint } : undefined,
			},
		);
		return response.ssh_keys;
	}

	async listDatacenters(): Promise<Array<{ id: number; name: string }>> {
		const response = await this.request<{
			datacenters: Array<{ id: number; name: string }>;
		}>("/datacenters");
		return response.datacenters;
	}

	private async request<T>(
		pathname: string,
		options?: {
			method?: string;
			body?: string;
			query?: Record<string, string>;
		},
	): Promise<T> {
		const method = options?.method ?? "GET";
		const url = new URL(`${this.baseURL}${pathname}`);
		for (const [key, value] of Object.entries(options?.query ?? {})) {
			url.searchParams.set(key, value);
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
				`failed to call hetzner api: ${method} ${url.pathname}`,
				{ cause: error },
			);
		}

		if (!response.ok) {
			const errorBody = (await response
				.json()
				.catch(() => ({}))) as HetznerErrorResponse;
			const message =
				errorBody.error?.message ??
				`${response.status} ${response.statusText}`.trim();
			const code = errorBody.error?.code;

			if (response.status === 401 || response.status === 403) {
				throw new ErrAuthFailed(message);
			}
			if (response.status === 404) {
				throw new ErrNotFound(message);
			}
			if (response.status === 429 || code === "resource_limit_exceeded") {
				throw new ErrQuotaExceeded(message);
			}
			throw new ErrProvisionFailed(message);
		}

		if (response.status === 204) {
			return undefined as T;
		}

		return (await response.json()) as T;
	}
}
