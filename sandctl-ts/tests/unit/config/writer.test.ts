import { describe, expect, test } from "bun:test";
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { save } from "@/config/writer";

describe("config writer", () => {
	test("writes yaml with expected content", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-writer-"));
		try {
			const configPath = path.join(tmpDir, "config.yaml");
			await save(configPath, {
				default_provider: "hetzner",
				ssh_key_source: "agent",
				providers: {
					hetzner: { token: "test-token", region: "ash" },
				},
			});

			const written = readFileSync(configPath, "utf8");
			expect(written).toContain("default_provider: hetzner");
			expect(written).toContain("token: test-token");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("creates missing directory with 0700 permissions", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-writer-"));
		try {
			const configPath = path.join(tmpDir, "nested", "dir", "config.yaml");
			await save(configPath, {
				default_provider: "hetzner",
				ssh_key_source: "agent",
				providers: { hetzner: { token: "test-token" } },
			});

			const dirMode = statSync(path.dirname(configPath)).mode & 0o777;
			expect(dirMode).toBe(0o700);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("writes file with 0600 permissions", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-writer-"));
		try {
			const configPath = path.join(tmpDir, "config.yaml");
			await save(configPath, {
				default_provider: "hetzner",
				ssh_key_source: "agent",
				providers: { hetzner: { token: "test-token" } },
			});

			const fileMode = statSync(configPath).mode & 0o777;
			expect(fileMode).toBe(0o600);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("preserves existing content if write fails", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-writer-"));
		try {
			const configPath = path.join(tmpDir, "config.yaml");
			writeFileSync(configPath, "default_provider: old\n", { mode: 0o600 });

			await expect(
				save(path.join(configPath, "child"), {
					default_provider: "hetzner",
					ssh_key_source: "agent",
					providers: { hetzner: { token: "test-token" } },
				}),
			).rejects.toBeDefined();

			expect(readFileSync(configPath, "utf8")).toBe("default_provider: old\n");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("omits undefined fields in output", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-writer-"));
		try {
			const configPath = path.join(tmpDir, "config.yaml");
			await save(configPath, {
				default_provider: "hetzner",
				ssh_key_source: "agent",
				git_user_name: undefined,
				providers: {
					hetzner: {
						token: "test-token",
						server_type: undefined,
					},
				},
			});

			const written = readFileSync(configPath, "utf8");
			expect(written).not.toContain("git_user_name");
			expect(written).not.toContain("server_type");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
