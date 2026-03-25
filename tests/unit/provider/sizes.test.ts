import { describe, expect, test } from "bun:test";

import { availableSizes, resolveSize, sizesHelpText } from "@/provider/sizes";

describe("provider/sizes", () => {
	test("resolves known sizes to server types", () => {
		expect(resolveSize("small")?.serverType).toBe("cpx21");
		expect(resolveSize("medium")?.serverType).toBe("cpx31");
		expect(resolveSize("large")?.serverType).toBe("cpx41");
		expect(resolveSize("xlarge")?.serverType).toBe("cpx51");
	});

	test("is case-insensitive", () => {
		expect(resolveSize("Small")?.serverType).toBe("cpx21");
		expect(resolveSize("LARGE")?.serverType).toBe("cpx41");
	});

	test("returns undefined for unknown sizes", () => {
		expect(resolveSize("tiny")).toBeUndefined();
		expect(resolveSize("mega")).toBeUndefined();
	});

	test("availableSizes returns all sizes", () => {
		const sizes = availableSizes();
		expect(sizes).toHaveLength(4);
		expect(sizes.map((s) => s.name)).toEqual([
			"small",
			"medium",
			"large",
			"xlarge",
		]);
	});

	test("sizesHelpText includes all sizes", () => {
		const text = sizesHelpText();
		expect(text).toContain("small");
		expect(text).toContain("medium");
		expect(text).toContain("large");
		expect(text).toContain("xlarge");
	});
});
