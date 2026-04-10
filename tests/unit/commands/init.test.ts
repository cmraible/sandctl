import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";

import { runInit } from "@/commands/init";

describe("init command (non-interactive)", () => {
	test("rejects --ssh-agent with --ssh-public-key", async () => {
		await expect(
			runInit(
				{
					hetznerToken: "token",
					sshAgent: true,
					sshPublicKey: "~/.ssh/id_ed25519.pub",
				},
				"/tmp/config.yaml",
			),
		).rejects.toThrow(
			"--ssh-agent and --ssh-public-key are mutually exclusive",
		);
	});

	test("rejects --git-user-name without --git-user-email", async () => {
		await expect(
			runInit(
				{
					hetznerToken: "token",
					sshAgent: true,
					gitUserName: "test",
				},
				"/tmp/config.yaml",
			),
		).rejects.toThrow(
			"--git-user-name and --git-user-email must be provided together",
		);
	});

	test("rejects invalid email", async () => {
		await expect(
			runInit(
				{
					hetznerToken: "token",
					sshAgent: true,
					gitUserName: "test",
					gitUserEmail: "invalid",
				},
				"/tmp/config.yaml",
			),
		).rejects.toThrow(
			"git user email format invalid: must contain @ with non-empty parts",
		);
	});

	test("rejects non-existent ssh key path", async () => {
		await expect(
			runInit(
				{
					hetznerToken: "token",
					sshPublicKey: "/this/file/does/not/exist.pub",
				},
				"/tmp/config.yaml",
			),
		).rejects.toThrow("SSH public key not found");
	});

	test("writes expected config for valid non-interactive flags", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-init-"));
		try {
			const keyPath = path.join(tmpDir, "id_ed25519.pub");
			writeFileSync(keyPath, "ssh-ed25519 AAAA test@example.com\n", {
				mode: 0o644,
			});
			const configPath = path.join(tmpDir, "config.yaml");

			await runInit(
				{
					hetznerToken: "token",
					sshPublicKey: keyPath,
					region: "hel1",
					serverType: "cpx41",
				},
				configPath,
			);

			const config = parse(readFileSync(configPath, "utf8")) as Record<
				string,
				unknown
			>;
			expect(config.default_provider).toBe("hetzner");
			expect(config.ssh_public_key).toBe(keyPath);
			expect(
				(config.providers as Record<string, { token: string }>).hetzner.token,
			).toBe("token");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("writes DigitalOcean config when selected", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-init-"));
		try {
			const configPath = path.join(tmpDir, "config.yaml");

			await runInit(
				{
					provider: "digitalocean",
					digitaloceanToken: "do-token",
					sshAgent: true,
					region: "sfo3",
					serverType: "s-8vcpu-16gb",
				},
				configPath,
			);

			const config = parse(readFileSync(configPath, "utf8")) as Record<
				string,
				unknown
			>;
			expect(config.default_provider).toBe("digitalocean");
			expect(
				(config.providers as Record<string, { token: string }>).digitalocean
					.token,
			).toBe("do-token");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("preserves existing provider config when adding another provider", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-init-"));
		try {
			const configPath = path.join(tmpDir, "config.yaml");
			writeFileSync(
				configPath,
				`default_provider: hetzner
ssh_key_source: agent
providers:
  hetzner:
    token: existing-hetzner
    region: ash
    server_type: cpx31
    image: ubuntu-24.04
`,
				{ mode: 0o600 },
			);

			await runInit(
				{
					provider: "digitalocean",
					digitaloceanToken: "do-token",
					sshAgent: true,
				},
				configPath,
			);

			const config = parse(readFileSync(configPath, "utf8")) as Record<
				string,
				unknown
			>;
			expect(
				(config.providers as Record<string, unknown>).hetzner,
			).toBeTruthy();
			expect(
				(config.providers as Record<string, { token: string }>).digitalocean
					.token,
			).toBe("do-token");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("expands tilde path for ssh public key", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-init-"));
		const home = os.homedir();
		const homeKeyPath = path.join(home, ".sandctl-test-key.pub");
		try {
			writeFileSync(homeKeyPath, "ssh-ed25519 AAAA test@example.com\n");
			const configPath = path.join(tmpDir, "config.yaml");

			await runInit(
				{
					hetznerToken: "token",
					sshPublicKey: "~/.sandctl-test-key.pub",
				},
				configPath,
			);

			const config = parse(readFileSync(configPath, "utf8")) as Record<
				string,
				unknown
			>;
			expect(config.ssh_public_key).toBe("~/.sandctl-test-key.pub");
		} finally {
			rmSync(homeKeyPath, { force: true });
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("saves claude_oauth_token when provided", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-init-"));
		try {
			const configPath = path.join(tmpDir, "config.yaml");

			await runInit(
				{
					hetznerToken: "token",
					sshAgent: true,
					claudeOauthToken: "sk-ant-oat01-test-token",
				},
				configPath,
			);

			const config = parse(readFileSync(configPath, "utf8")) as Record<
				string,
				unknown
			>;
			expect(config.claude_oauth_token).toBe("sk-ant-oat01-test-token");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("returns result object with config path", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sandctl-ts-init-"));
		try {
			const configPath = path.join(tmpDir, "config.yaml");

			const result = await runInit(
				{
					hetznerToken: "token",
					sshAgent: true,
				},
				configPath,
			);

			expect(result).toEqual({
				config_path: configPath,
				saved: true,
			});
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
