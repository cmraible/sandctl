import { createHash } from "node:crypto";

import type { DigitalOceanSSHKey } from "@/digitalocean/client";

export interface SSHKeyClient {
	listSSHKeys(): Promise<DigitalOceanSSHKey[]>;
	createSSHKey(name: string, publicKey: string): Promise<DigitalOceanSSHKey>;
}

export function calculateFingerprint(publicKey: string): string {
	const parts = publicKey.trim().split(/\s+/);
	if (parts.length < 2) {
		throw new Error("invalid public key format");
	}

	const keyData = Buffer.from(parts[1], "base64");
	if (keyData.length === 0) {
		throw new Error("invalid public key encoding");
	}

	const hex = createHash("md5").update(keyData).digest("hex");
	return hex.match(/.{1,2}/g)?.join(":") ?? "";
}

export async function ensureSSHKey(
	client: SSHKeyClient,
	name: string,
	publicKey: string,
): Promise<string> {
	const fingerprint = calculateFingerprint(publicKey);

	const existing = await client.listSSHKeys();
	const found = existing.find((key) => key.fingerprint === fingerprint);
	if (found) {
		return String(found.id);
	}

	try {
		const created = await client.createSSHKey(name, publicKey);
		return String(created.id);
	} catch (error) {
		const raced = await client.listSSHKeys();
		const raceWinner = raced.find((key) => key.fingerprint === fingerprint);
		if (raceWinner) {
			return String(raceWinner.id);
		}
		throw error;
	}
}
