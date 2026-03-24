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
		expect(validateID("my-project")).toBeTrue();
		expect(validateID("abc123")).toBeTrue();
		expect(validateID("dev-server-2")).toBeTrue();
	});

	test("validateID rejects invalid names", () => {
		expect(validateID("Alice")).toBeFalse();
		expect(validateID("a")).toBeFalse();
		expect(validateID("-abc")).toBeFalse();
		expect(validateID("abc-")).toBeFalse();
		expect(validateID("a".repeat(31))).toBeFalse();
	});

	test("normalizeName lowercases input", () => {
		expect(normalizeName("AlIcE")).toBe("alice");
	});

	test("normalizeName trims whitespace", () => {
		expect(normalizeName("  alice  ")).toBe("alice");
		expect(normalizeName("\talice\n")).toBe("alice");
	});
});
