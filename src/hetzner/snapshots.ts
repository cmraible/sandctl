import { createHash } from "node:crypto";
import type { CreateImageOpts, HetznerImage } from "@/hetzner/client";
import { generateCloudInit } from "@/hetzner/setup";

const SNAPSHOT_LABEL_SELECTOR = "managed-by=sandctl,purpose=base-image";
const SNAPSHOT_DESCRIPTION_PREFIX = "sandctl-base-v";
const SNAPSHOT_POLL_INTERVAL_MS = 5_000;
const SNAPSHOT_TIMEOUT_MS = 5 * 60 * 1000;

export interface SnapshotClientLike {
	createImage(serverId: string, opts: CreateImageOpts): Promise<HetznerImage>;
	getImage(id: string): Promise<HetznerImage>;
	listImages(labelSelector?: string): Promise<HetznerImage[]>;
	deleteImage(id: string): Promise<void>;
}

export function snapshotVersion(): string {
	return createHash("sha256")
		.update(generateCloudInit())
		.digest("hex")
		.slice(0, 12);
}

function snapshotDescription(): string {
	return `${SNAPSHOT_DESCRIPTION_PREFIX}${snapshotVersion()}`;
}

export async function findBaseSnapshot(
	client: SnapshotClientLike,
): Promise<HetznerImage | null> {
	const images = await client.listImages(SNAPSHOT_LABEL_SELECTOR);
	const expected = snapshotDescription();
	const match = images.find(
		(img) => img.description === expected && img.status === "available",
	);
	return match ?? null;
}

export async function createBaseSnapshot(
	client: SnapshotClientLike,
	serverId: string,
	sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<HetznerImage> {
	const image = await client.createImage(serverId, {
		description: snapshotDescription(),
		type: "snapshot",
		labels: { "managed-by": "sandctl", purpose: "base-image" },
	});

	const deadline = Date.now() + SNAPSHOT_TIMEOUT_MS;
	let current = image;

	while (current.status !== "available") {
		if (Date.now() > deadline) {
			throw new Error(
				`snapshot ${current.id} did not become available within timeout`,
			);
		}
		await sleep(SNAPSHOT_POLL_INTERVAL_MS);
		current = await client.getImage(String(current.id));
	}

	return current;
}

export async function cleanupOldSnapshots(
	client: SnapshotClientLike,
): Promise<void> {
	const images = await client.listImages(SNAPSHOT_LABEL_SELECTOR);
	const currentDesc = snapshotDescription();

	for (const img of images) {
		if (img.description !== currentDesc) {
			await client.deleteImage(String(img.id));
		}
	}
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
