import { describe, expect, test } from "bun:test";

import type { HetznerImage } from "@/hetzner/client";
import {
	cleanupOldSnapshots,
	createBaseSnapshot,
	findBaseSnapshot,
	snapshotVersion,
} from "@/hetzner/snapshots";

const TEST_USER_DATA = "#cloud-config\nusers:\n  - name: agent\n";

function makeImage(overrides: Partial<HetznerImage> = {}): HetznerImage {
	return {
		id: 100,
		type: "snapshot",
		status: "available",
		description: `sandctl-base-v${snapshotVersion(TEST_USER_DATA)}`,
		created: "2026-04-12T00:00:00Z",
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
			const version = snapshotVersion(TEST_USER_DATA);
			expect(version).toMatch(/^[0-9a-f]{12}$/);
		});

		test("returns consistent value for same input", () => {
			expect(snapshotVersion(TEST_USER_DATA)).toBe(
				snapshotVersion(TEST_USER_DATA),
			);
		});

		test("returns different values for different input", () => {
			expect(snapshotVersion("input-a")).not.toBe(snapshotVersion("input-b"));
		});
	});

	describe("findBaseSnapshot", () => {
		test("returns null when no snapshots exist", async () => {
			const client = makeClient([]);
			const result = await findBaseSnapshot(client, TEST_USER_DATA);
			expect(result).toBeNull();
		});

		test("returns matching snapshot", async () => {
			const image = makeImage();
			const client = makeClient([image]);
			const result = await findBaseSnapshot(client, TEST_USER_DATA);
			expect(result).toEqual(image);
		});

		test("prefers newest matching snapshot when duplicates exist", async () => {
			const older = makeImage({
				id: 100,
				created: "2026-04-12T00:00:00Z",
			});
			const newer = makeImage({
				id: 200,
				created: "2026-04-12T01:00:00Z",
			});
			const client = makeClient([older, newer]);
			const result = await findBaseSnapshot(client, TEST_USER_DATA);
			expect(result?.id).toBe(200);
		});

		test("ignores snapshots with wrong version", async () => {
			const image = makeImage({ description: "sandctl-base-vwrongversion" });
			const client = makeClient([image]);
			const result = await findBaseSnapshot(client, TEST_USER_DATA);
			expect(result).toBeNull();
		});

		test("ignores snapshots with status 'creating'", async () => {
			const image = makeImage({ status: "creating" });
			const client = makeClient([image]);
			const result = await findBaseSnapshot(client, TEST_USER_DATA);
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
			const result = await createBaseSnapshot(
				client,
				"123",
				TEST_USER_DATA,
				noSleep,
			);
			expect(result.status).toBe("available");
			expect(pollCount).toBe(2);
		});

		test("returns immediately if already available", async () => {
			const client = {
				...makeClient(),
				createImage: async () => makeImage({ status: "available" }),
			};

			const noSleep = async () => {};
			const result = await createBaseSnapshot(
				client,
				"123",
				TEST_USER_DATA,
				noSleep,
			);
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

			await cleanupOldSnapshots(client, TEST_USER_DATA);
			expect(client.calls).toContain("deleteImage:200");
			expect(client.calls).not.toContain("deleteImage:300");
		});

		test("deletes older duplicates of the current version", async () => {
			const older = makeImage({
				id: 200,
				created: "2026-04-12T00:00:00Z",
			});
			const newer = makeImage({
				id: 300,
				created: "2026-04-12T01:00:00Z",
			});
			const client = makeClient([older, newer]);

			await cleanupOldSnapshots(client, TEST_USER_DATA);
			expect(client.calls).toContain("deleteImage:200");
			expect(client.calls).not.toContain("deleteImage:300");
		});

		test("does nothing when all snapshots are current", async () => {
			const current = makeImage({ id: 300 });
			const client = makeClient([current]);

			await cleanupOldSnapshots(client, TEST_USER_DATA);
			expect(client.calls).toEqual(["listImages"]);
		});
	});
});
