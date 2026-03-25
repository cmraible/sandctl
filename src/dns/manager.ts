import { CloudflareClient } from "@/cloudflare/client";
import type { Config } from "@/config/config";

export interface DNSManager {
	createRecord(sessionName: string, ipAddress: string): Promise<void>;
	deleteRecord(sessionName: string): Promise<void>;
	updateRecord(
		oldName: string,
		newName: string,
		ipAddress: string,
	): Promise<void>;
	fqdn(sessionName: string): string;
}

export function createDNSManager(config: Config): DNSManager | null {
	if (
		!config.dns?.cloudflare_api_token ||
		!config.dns?.cloudflare_zone_id ||
		!config.dns?.domain
	) {
		return null;
	}

	const client = new CloudflareClient(
		config.dns.cloudflare_api_token,
		config.dns.cloudflare_zone_id,
	);
	const domain = config.dns.domain;

	function fqdn(sessionName: string): string {
		return `${sessionName}.${domain}`;
	}

	return {
		fqdn,

		async createRecord(sessionName: string, ipAddress: string): Promise<void> {
			await client.createDNSRecord(fqdn(sessionName), ipAddress);
		},

		async deleteRecord(sessionName: string): Promise<void> {
			const records = await client.listDNSRecords(fqdn(sessionName));
			for (const record of records) {
				await client.deleteDNSRecord(record.id);
			}
		},

		async updateRecord(
			oldName: string,
			newName: string,
			ipAddress: string,
		): Promise<void> {
			// Delete old record, create new one
			const records = await client.listDNSRecords(fqdn(oldName));
			for (const record of records) {
				await client.deleteDNSRecord(record.id);
			}
			await client.createDNSRecord(fqdn(newName), ipAddress);
		},
	};
}
