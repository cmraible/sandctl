import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	type Config,
	getGitConfig,
	getProviderConfig,
	getPublicKeyFromAgent,
	getSSHPublicKey,
	hasGitConfig,
	hasGitHubToken,
	InsecurePermissionsError,
	load,
	NotFoundError,
	setProviderSSHKeyID,
	ValidationError,
	validate,
} from "@/config/config";

describe("config", () => {
	test("load parses valid yaml", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-config-"));
		try {
			const keyPath = path.join(tmpDir, "id_ed25519.pub");
			writeFileSync(keyPath, "ssh-ed25519 AAAA test@example.com\n", {
				mode: 0o644,
			});
			const configPath = path.join(tmpDir, "config.yaml");
			writeFileSync(
				configPath,
				`default_provider: hetzner
ssh_public_key: ${keyPath}
providers:
  hetzner:
    token: test-token
`,
				{ mode: 0o600 },
			);

			const config = await load(configPath);
			expect(config.default_provider).toBe("hetzner");
			expect(config.providers?.hetzner?.token).toBe("test-token");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("load rejects insecure permissions", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-config-"));
		try {
			const configPath = path.join(tmpDir, "config.yaml");
			writeFileSync(
				configPath,
				"default_provider: hetzner\nssh_key_source: agent\n",
				{
					mode: 0o644,
				},
			);
			chmodSync(configPath, 0o644);

			await expect(load(configPath)).rejects.toBeInstanceOf(
				InsecurePermissionsError,
			);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("load missing file throws NotFoundError", async () => {
		await expect(
			load("/definitely/missing/config.yaml"),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	test("load expands tilde paths", async () => {
		const home = os.homedir();
		const sandctlDir = path.join(home, ".sandctl");
		const fileName = `config.test.${Date.now()}.yaml`;
		const configPath = path.join(sandctlDir, fileName);
		try {
			mkdirSync(sandctlDir, { recursive: true, mode: 0o700 });
			writeFileSync(
				configPath,
				"default_provider: hetzner\nssh_key_source: agent\nproviders:\n  hetzner:\n    token: test-token\n",
				{ mode: 0o600 },
			);

			const config = await load(`~/.sandctl/${fileName}`);
			expect(config.default_provider).toBe("hetzner");
			expect(config.providers?.hetzner?.token).toBe("test-token");
		} finally {
			rmSync(configPath, { force: true });
		}
	});

	test("validate requires default_provider", () => {
		expect(() => validate({ ssh_key_source: "agent" })).toThrow(
			ValidationError,
		);
	});

	test("validate requires ssh configuration", () => {
		expect(() => validate({ default_provider: "hetzner" })).toThrow(
			ValidationError,
		);
	});

	test("validate rejects invalid email", () => {
		expect(() =>
			validate({
				default_provider: "hetzner",
				ssh_key_source: "agent",
				git_user_email: "invalid-email",
			}),
		).toThrow(ValidationError);
	});

	test("load migrates legacy sprites_token", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-config-"));
		try {
			const configPath = path.join(tmpDir, "config.yaml");
			writeFileSync(
				configPath,
				"sprites_token: old-token\nssh_key_source: agent\n",
				{
					mode: 0o600,
				},
			);

			const config = await load(configPath);
			expect(config.default_provider).toBe("hetzner");
			expect(config.providers?.hetzner?.token).toBe("old-token");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("helper methods return expected values", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-config-"));
		try {
			const keyPath = path.join(tmpDir, "id_ed25519.pub");
			writeFileSync(keyPath, "ssh-ed25519 AAAA test@example.com\n", {
				mode: 0o644,
			});
			const config: Config = {
				default_provider: "hetzner",
				ssh_public_key: keyPath,
				providers: {
					hetzner: { token: "test-token" },
				},
				git_user_name: "Test User",
				git_user_email: "test@example.com",
				github_token: "ghp_test",
			};

			expect(getProviderConfig(config, "hetzner")?.token).toBe("test-token");
			setProviderSSHKeyID(config, "hetzner", 42);
			expect(getProviderConfig(config, "hetzner")?.ssh_key_id).toBe(42);
			expect(await getSSHPublicKey(config)).toBe(
				"ssh-ed25519 AAAA test@example.com",
			);
			expect(getGitConfig(config)).toEqual({
				path: undefined,
				name: "Test User",
				email: "test@example.com",
			});
			expect(hasGitConfig(config)).toBeTrue();
			expect(hasGitHubToken(config)).toBeTrue();
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("getSSHPublicKey falls back to ssh_public_key path in agent mode", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-config-"));
		try {
			const keyPath = path.join(tmpDir, "id_ed25519.pub");
			writeFileSync(keyPath, "ssh-ed25519 AAAA agent@example.com\n", {
				mode: 0o644,
			});

			const config: Config = {
				default_provider: "hetzner",
				ssh_key_source: "agent",
				ssh_public_key: keyPath,
			};

			expect(await getSSHPublicKey(config)).toBe(
				"ssh-ed25519 AAAA agent@example.com",
			);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("getPublicKeyFromAgent returns undefined when no agent is available", async () => {
		// In CI / test environments, there is typically no SSH agent
		// so this should return undefined rather than throwing
		const result = await getPublicKeyFromAgent();
		// Result is either undefined (no agent) or a valid key string
		expect(result === undefined || result.startsWith("ssh-")).toBe(true);
	});

	test("getSSHPublicKey falls back to default agent key path or agent", async () => {
		const candidatePaths = [
			path.join(os.homedir(), ".ssh", "id_ed25519.pub"),
			path.join(os.homedir(), ".ssh", "id_rsa.pub"),
		];
		const existingPath = candidatePaths.find((candidate) =>
			existsSync(candidate),
		);

		const config: Config = {
			default_provider: "hetzner",
			ssh_key_source: "agent",
		};

		if (existingPath) {
			const expected = readFileSync(existingPath, "utf8").trim();
			expect(await getSSHPublicKey(config)).toBe(expected);
			return;
		}

		// No key file on disk — falls back to SSH agent.
		// If an agent is reachable (e.g. 1Password via IdentityAgent),
		// getSSHPublicKey returns a key; otherwise it throws.
		try {
			const key = await getSSHPublicKey(config);
			expect(key.startsWith("ssh-")).toBe(true);
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
		}
	});
});
