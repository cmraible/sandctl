const BASE_URL = "https://api.cloudflare.com/client/v4";

export interface DNSRecord {
	id: string;
	type: string;
	name: string;
	content: string;
	ttl: number;
	proxied: boolean;
}

interface CloudflareResponse<T> {
	success: boolean;
	errors: Array<{ code: number; message: string }>;
	result: T;
}

export class CloudflareClient {
	constructor(
		private readonly token: string,
		private readonly zoneId: string,
		private readonly baseURL = BASE_URL,
	) {}

	async createDNSRecord(
		name: string,
		ip: string,
		ttl = 60,
	): Promise<DNSRecord> {
		const response = await this.request<DNSRecord>(
			`/zones/${this.zoneId}/dns_records`,
			{
				method: "POST",
				body: JSON.stringify({
					type: "A",
					name,
					content: ip,
					ttl,
					proxied: false,
				}),
			},
		);
		return response;
	}

	async deleteDNSRecord(recordId: string): Promise<void> {
		await this.request<{ id: string }>(
			`/zones/${this.zoneId}/dns_records/${recordId}`,
			{ method: "DELETE" },
		);
	}

	async listDNSRecords(name?: string): Promise<DNSRecord[]> {
		const query: Record<string, string> = { type: "A" };
		if (name) {
			query.name = name;
		}
		const response = await this.request<DNSRecord[]>(
			`/zones/${this.zoneId}/dns_records`,
			{ query },
		);
		return response;
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

		const response = await fetch(url, {
			method,
			headers: {
				Authorization: `Bearer ${this.token}`,
				"Content-Type": "application/json",
			},
			body: options?.body,
		});

		const body = (await response.json()) as CloudflareResponse<T>;

		if (!response.ok || !body.success) {
			const message =
				body.errors?.map((e) => e.message).join(", ") ??
				`${response.status} ${response.statusText}`;
			throw new Error(`Cloudflare API error: ${message}`);
		}

		return body.result;
	}
}
