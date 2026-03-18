import { describe, expect, test } from "bun:test";

import type { HetznerImage } from "@/hetzner/client";
import {
	cleanupOldSnapshots,
	createBaseSnapshot,
	findBaseSnapshot,
	snapshotVersion,
} from "@/hetzner/snapshots";

function makeImage(overrides: Partial<HetznerImage> = {}): HetznerImage {
	return {
		id: 100,
		type: "snapshot",
		status: "available",
		description: `sandctl-base-v${snapshotVersion()}`,
		labels: { "managed-by": "sandctl", purpose: "base-image" },
		created_from: { id: 1, name: "test-server" },
		...overrides,
	};
}

function makeClient(images: HetznerImage[] = []) {
	const calls: string[] = [];
	return {
		calls,
		createImage: async (_serverId: string) => {
			calls.push("createImage");
			return makeImage({ status: "creating" });
		},
		getImage: async () => {
			calls.push("getImage");
			return makeImage({ status: "available" });
		},
		listImages: async () => {
			calls.push("listImages");
			return images;
		},
		deleteImage: async (id: string) => {
			calls.push(`deleteImage:${id}`);
		},
	};
}

describe("hetzner/snapshots", () => {
	describe("snapshotVersion", () => {
		test("returns a 12-character hex string", () => {
			const version = snapshotVersion();
			expect(version).toMatch(/^[0-9a-f]{12}$/);
		});

		test("returns consistent value", () => {
			expect(snapshotVersion()).toBe(snapshotVersion());
		});
	});

	describe("findBaseSnapshot", () => {
		test("returns null when no snapshots exist", async () => {
			const client = makeClient([]);
			const result = await findBaseSnapshot(client);
			expect(result).toBeNull();
		});

		test("returns matching snapshot", async () => {
			const image = makeImage();
			const client = makeClient([image]);
			const result = await findBaseSnapshot(client);
			expect(result).toEqual(image);
		});

		test("ignores snapshots with wrong version", async () => {
			const image = makeImage({ description: "sandctl-base-vwrongversion" });
			const client = makeClient([image]);
			const result = await findBaseSnapshot(client);
			expect(result).toBeNull();
		});

		test("ignores snapshots with status 'creating'", async () => {
			const image = makeImage({ status: "creating" });
			const client = makeClient([image]);
			const result = await findBaseSnapshot(client);
			expect(result).toBeNull();
		});
	});

	describe("createBaseSnapshot", () => {
		test("creates snapshot and polls until available", async () => {
			let pollCount = 0;
			const client = {
				...makeClient(),
				createImage: async () => makeImage({ status: "creating" }),
				getImage: async () => {
					pollCount++;
					if (pollCount < 2) {
						return makeImage({ status: "creating" });
					}
					return makeImage({ status: "available" });
				},
			};

			const noSleep = async () => {};
			const result = await createBaseSnapshot(client, "123", noSleep);
			expect(result.status).toBe("available");
			expect(pollCount).toBe(2);
		});

		test("returns immediately if already available", async () => {
			const client = {
				...makeClient(),
				createImage: async () => makeImage({ status: "available" }),
			};

			const noSleep = async () => {};
			const result = await createBaseSnapshot(client, "123", noSleep);
			expect(result.status).toBe("available");
		});
	});

	describe("cleanupOldSnapshots", () => {
		test("deletes snapshots with non-current version", async () => {
			const old = makeImage({
				id: 200,
				description: "sandctl-base-voldversion12",
			});
			const current = makeImage({ id: 300 });
			const client = makeClient([old, current]);

			await cleanupOldSnapshots(client);
			expect(client.calls).toContain("deleteImage:200");
			expect(client.calls).not.toContain("deleteImage:300");
		});

		test("does nothing when all snapshots are current", async () => {
			const current = makeImage({ id: 300 });
			const client = makeClient([current]);

			await cleanupOldSnapshots(client);
			expect(client.calls).toEqual(["listImages"]);
		});
	});
});
