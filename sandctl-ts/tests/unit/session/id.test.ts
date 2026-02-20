import { describe, expect, test } from "bun:test";

import { generateID, normalizeName, validateID } from "@/session/id";

describe("session/id", () => {
	test("generated IDs are 2-15 lowercase letters", () => {
		const id = generateID([]);
		expect(validateID(id)).toBeTrue();
	});

	test("validateID accepts valid names", () => {
		expect(validateID("alice")).toBeTrue();
		expect(validateID("bob")).toBeTrue();
	});

	test("validateID rejects invalid names", () => {
		expect(validateID("Alice")).toBeFalse();
		expect(validateID("abc123")).toBeFalse();
		expect(validateID("a")).toBeFalse();
		expect(validateID("abcdefghijklmnop")).toBeFalse();
	});

	test("normalizeName lowercases input", () => {
		expect(normalizeName("AlIcE")).toBe("alice");
	});
});
