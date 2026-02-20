import { describe, expect, test } from "bun:test";

import { validateID } from "@/session/id";
import { getRandomName, names } from "@/session/names";

describe("session/names", () => {
	test("name pool has exactly 250 entries", () => {
		expect(names).toHaveLength(250);
	});

	test("all names match validateID format", () => {
		for (const name of names) {
			expect(validateID(name)).toBeTrue();
		}
	});

	test("getRandomName avoids collisions", () => {
		const selected = getRandomName(names.slice(0, 249));
		expect(selected).toBe(names[249]);
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
