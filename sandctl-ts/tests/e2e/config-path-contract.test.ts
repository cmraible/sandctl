import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";

import { cleanupTempHome, makeTempHome, runBinary } from "./helpers";

describe("sandctl config path contract", () => {
	test("binary resolves default ~/.sandctl/config without --config", () => {
		const home = makeTempHome();
		try {
			const initResult = runBinary(
				["init", "--hetzner-token", "test-token", "--ssh-agent"],
				{ env: { HOME: home } },
			);

			expect(initResult.code).toBe(0);
			expect(initResult.stdout).toContain(
				path.join(home, ".sandctl", "config"),
			);
			expect(existsSync(path.join(home, ".sandctl", "config"))).toBeTrue();

			const listResult = runBinary(["list", "--format", "json"], {
				env: { HOME: home },
			});
			expect(listResult.code).toBe(0);
			expect(listResult.stdout.trim()).toBe("[]");
		} finally {
			cleanupTempHome(home);
		}
	});
});
