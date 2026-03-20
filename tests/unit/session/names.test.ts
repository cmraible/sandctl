import { describe, expect, test } from "bun:test";

import { validateID } from "@/session/id";
import { getRandomName, names } from "@/session/names";

describe("session/names", () => {
	test("name pool has at least 250 entries", () => {
		expect(names.length).toBeGreaterThanOrEqual(250);
	});

	test("all names match validateID format", () => {
		for (const name of names) {
			expect(validateID(name)).toBeTrue();
		}
	});

	test("getRandomName avoids collisions", () => {
		const allButLast = names.slice(0, names.length - 1);
		const selected = getRandomName(allButLast);
		expect(selected).toBe(names[names.length - 1]);
	});

	test("getRandomName throws when all names are in use", () => {
		expect(() => getRandomName([...names])).toThrow();
	});

	test("random selection is not deterministic", () => {
		const selected = new Set(
			Array.from({ length: 10 }, () => getRandomName([])),
		);
		expect(selected.size).toBeGreaterThan(1);
	});
});
