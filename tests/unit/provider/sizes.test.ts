import { describe, expect, test } from "bun:test";

import { availableSizes, resolveSize, sizesHelpText } from "@/provider/sizes";

describe("provider/sizes", () => {
	test("resolves Hetzner sizes to server types", () => {
		expect(resolveSize("small", "hetzner")?.serverType).toBe("cpx21");
		expect(resolveSize("medium", "hetzner")?.serverType).toBe("cpx31");
		expect(resolveSize("large", "hetzner")?.serverType).toBe("cpx41");
		expect(resolveSize("xlarge", "hetzner")?.serverType).toBe("cpx51");
	});

	test("resolves DigitalOcean sizes to server types", () => {
		expect(resolveSize("small", "digitalocean")?.serverType).toBe(
			"s-2vcpu-4gb",
		);
		expect(resolveSize("medium", "digitalocean")?.serverType).toBe(
			"s-4vcpu-8gb",
		);
		expect(resolveSize("large", "digitalocean")?.serverType).toBe(
			"s-8vcpu-16gb",
		);
		expect(resolveSize("xlarge", "digitalocean")?.serverType).toBe(
			"s-16vcpu-32gb",
		);
	});

	test("is case-insensitive", () => {
		expect(resolveSize("Small", "hetzner")?.serverType).toBe("cpx21");
		expect(resolveSize("LARGE", "digitalocean")?.serverType).toBe(
			"s-8vcpu-16gb",
		);
	});

	test("returns undefined for unknown sizes", () => {
		expect(resolveSize("tiny", "hetzner")).toBeUndefined();
		expect(resolveSize("mega", "digitalocean")).toBeUndefined();
	});

	test("availableSizes returns all sizes for a provider", () => {
		const sizes = availableSizes("digitalocean");
		expect(sizes).toHaveLength(4);
		expect(sizes.map((s) => s.name)).toEqual([
			"small",
			"medium",
			"large",
			"xlarge",
		]);
	});

	test("sizesHelpText includes all sizes", () => {
		const text = sizesHelpText("digitalocean");
		expect(text).toContain("small");
		expect(text).toContain("medium");
		expect(text).toContain("large");
		expect(text).toContain("xlarge");
	});
});
