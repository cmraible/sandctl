import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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

	test("binary writes a DigitalOcean config to the default path", () => {
		const home = makeTempHome();
		try {
			const initResult = runBinary(
				[
					"init",
					"--provider",
					"digitalocean",
					"--digitalocean-token",
					"test-token",
					"--ssh-agent",
				],
				{ env: { HOME: home } },
			);

			expect(initResult.code).toBe(0);

			const configPath = path.join(home, ".sandctl", "config");
			expect(existsSync(configPath)).toBeTrue();
			expect(readFileSync(configPath, "utf8")).toContain(
				"default_provider: digitalocean",
			);
		} finally {
			cleanupTempHome(home);
		}
	});
});
