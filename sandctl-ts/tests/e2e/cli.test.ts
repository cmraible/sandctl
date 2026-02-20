import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

import { runBinary } from "./helpers";

describe("sandctl e2e", () => {
	const versionTest = existsSync("./sandctl") ? test : test.skip;

	versionTest("sandctl version prints version info", () => {
		const result = runBinary(["version"]);

		expect(result.code).toBe(0);
		expect(result.stdout).toContain("sandctl version");
		expect(result.stdout).toContain("commit:");
		expect(result.stdout).toContain("built:");
	});
});
