import { describe, expect, test } from "bun:test";
import { parse } from "yaml";

import {
	assembleUserData,
	detectContentType,
	generateCloudInit,
	generatePostSnapshotSSHSetup,
} from "@/hetzner/setup";

describe("hetzner/setup", () => {
	describe("generateCloudInit", () => {
		test("creates agent user with sudo group", () => {
			const output = generateCloudInit();
			expect(output).toContain("name: agent");
			expect(output).toContain("sudo");
		});

		test("does not emit an empty ssh_authorized_keys list", () => {
			const output = generateCloudInit();
			expect(output).not.toContain("ssh_authorized_keys: []");
		});

		test("writes explicit passwordless sudoers entry for agent", () => {
			const output = generateCloudInit();
			expect(output).toContain(
				"echo 'agent ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/99-agent",
			);
			expect(output).toContain("chmod 440 /etc/sudoers.d/99-agent");
		});

		test("copies SSH keys from root to agent user", () => {
			const output = generateCloudInit();
			expect(output).toContain(
				"cp /root/.ssh/authorized_keys /home/agent/.ssh/authorized_keys",
			);
		});

		test("installs Claude Code via native installer", () => {
			const output = generateCloudInit();
			expect(output).toContain("claude.ai/install.sh");
		});

		test("retries and verifies agent CLI installs", () => {
			const output = generateCloudInit();
			expect(output).toContain(
				"until su - agent -c 'curl -fsSL https://claude.ai/install.sh | bash'; do",
			);
			expect(output).toContain(
				'codex_version="$(npm view @openai/codex version)"',
			);
			expect(output).toContain('arch="$(dpkg --print-architecture)"');
			expect(output).toContain(
				'codex_platform_package="@openai/codex-linux-x64@npm:@openai/codex@' +
					"${codex_version}" +
					'-linux-x64"',
			);
			expect(output).toContain(
				'codex_platform_package="@openai/codex-linux-arm64@npm:@openai/codex@' +
					"${codex_version}" +
					'-linux-arm64"',
			);
			expect(output).toContain(
				'until npm install -g "@openai/codex@' +
					"${codex_version}" +
					'" "$codex_platform_package"; do',
			);
			expect(output).toContain(
				"su - agent -c 'export PATH=\"$HOME/.local/bin:$PATH\"; claude --version'",
			);
			expect(output).toContain(
				"su - agent -c 'export PATH=\"$HOME/.local/bin:$PATH\"; codex --version'",
			);
		});

		test("adds agent user to docker group", () => {
			const output = generateCloudInit();
			expect(output).toContain("docker");
		});

		test("installs and enables Docker", () => {
			const output = generateCloudInit();
			expect(output).toContain("- docker.io");
			expect(output).toContain("systemctl enable --now docker");
		});

		test("installs gh CLI from official GitHub repository", () => {
			const output = generateCloudInit();
			expect(output).toContain("apt-get install -y gh");
			expect(output).toContain("githubcli-archive-keyring.gpg");
		});

		test("writes GitHub auth files when github token is provided", () => {
			const output = generateCloudInit({ githubToken: "ghp_test_token" });
			expect(output).toContain("/home/agent/.config/sandctl/github-token");
			expect(output).toContain("/home/agent/.config/gh/hosts.yml");
			expect(output).toContain("/etc/profile.d/sandctl-github-token.sh");
			expect(output).toContain("chown -R agent:agent /home/agent/.config");
		});

		test("omits GitHub auth files when github token is absent", () => {
			const output = generateCloudInit();
			expect(output).not.toContain("/home/agent/.config/sandctl/github-token");
			expect(output).not.toContain("/home/agent/.config/gh/hosts.yml");
		});

		test("overwrites interactive shell config in agent zshrc", () => {
			const output = generateCloudInit();
			expect(output).toContain("base64 -d > /home/agent/.zshrc");
			expect(output).not.toContain(">> /home/agent/.zshrc");
			expect(output).not.toContain(">> /etc/zsh/zshrc");
			expect(output).toContain("chown agent:agent /home/agent/.zshrc");
			expect(output).toContain("chmod 644 /home/agent/.zshrc");
		});

		test("renders valid cloud-config yaml", () => {
			const parsed = parse(generateCloudInit()) as {
				users?: Array<{ name?: string }>;
				runcmd?: string[];
			};

			expect(parsed.users?.some((user) => user.name === "agent")).toBe(true);
			expect(Array.isArray(parsed.runcmd)).toBe(true);
		});
	});

	describe("generatePostSnapshotSSHSetup", () => {
		test("copies SSH keys from root to agent user", () => {
			const output = generatePostSnapshotSSHSetup();
			expect(output).toContain(
				"cp /root/.ssh/authorized_keys /home/agent/.ssh/authorized_keys",
			);
		});

		test("sets correct ownership and permissions", () => {
			const output = generatePostSnapshotSSHSetup();
			expect(output).toContain("chown -R agent:agent /home/agent/.ssh");
			expect(output).toContain("chmod 700 /home/agent/.ssh");
			expect(output).toContain("chmod 600 /home/agent/.ssh/authorized_keys");
		});
	});

	describe("detectContentType", () => {
		test("detects cloud-config YAML", () => {
			expect(detectContentType("#cloud-config\npackages:\n  - git\n")).toBe(
				"text/cloud-config",
			);
		});

		test("detects bash script by shebang", () => {
			expect(detectContentType("#!/bin/bash\necho hello\n")).toBe(
				"text/x-shellscript",
			);
		});

		test("defaults to shellscript for unknown content", () => {
			expect(detectContentType("echo hello\n")).toBe("text/x-shellscript");
		});

		test("handles leading whitespace before #cloud-config", () => {
			expect(detectContentType("  \n#cloud-config\npackages:\n")).toBe(
				"text/cloud-config",
			);
		});
	});

	describe("assembleUserData", () => {
		test("returns plain cloud-config when no additional layers", () => {
			const base = "#cloud-config\nusers:\n  - name: agent\n";
			const result = assembleUserData(base);
			expect(result).toContain("SANDCTL BEGIN GLOBAL CLOUD-INIT");
			expect(result).toContain("SANDCTL END GLOBAL CLOUD-INIT");
			expect(result).toContain("name: agent");
		});

		test("returns plain cloud-config with empty layers array", () => {
			const base = "#cloud-config\nusers:\n  - name: agent\n";
			const result = assembleUserData(base, []);
			expect(result).toContain("SANDCTL BEGIN GLOBAL CLOUD-INIT");
			expect(result).toContain("SANDCTL END GLOBAL CLOUD-INIT");
			expect(result).toContain("name: agent");
		});

		test("wraps in MIME multipart with one additional layer", () => {
			const base = "#cloud-config\nusers:\n  - name: agent\n";
			const layer = "#!/bin/bash\necho hello\n";
			const result = assembleUserData(base, [layer]);

			expect(result).toContain(
				'Content-Type: multipart/mixed; boundary="==SANDCTL=="',
			);
			expect(result).toContain("MIME-Version: 1.0");
			expect(result).toContain("--==SANDCTL==");
			expect(result).toContain("--==SANDCTL==--");
			expect(result).toContain("Content-Type: text/cloud-config");
			expect(result).toContain("Content-Type: text/x-shellscript");
			expect(result).toContain("name: agent");
			expect(result).toContain("echo hello");
			expect(result).toContain("SANDCTL BEGIN GLOBAL CLOUD-INIT");
			expect(result).toContain("SANDCTL END GLOBAL CLOUD-INIT");
			expect(result).toContain("SANDCTL BEGIN LAYER 1");
			expect(result).toContain("SANDCTL END LAYER 1");
		});

		test("wraps in MIME multipart with two additional layers", () => {
			const base = "#cloud-config\nusers:\n  - name: agent\n";
			const userBase = "#cloud-config\npackages:\n  - git\n";
			const named = "#!/bin/bash\necho hello\n";
			const result = assembleUserData(base, [userBase, named]);

			// Should have 3 cloud-config/shellscript parts
			const cloudConfigCount = (
				result.match(/Content-Type: text\/cloud-config/g) || []
			).length;
			const shellscriptCount = (
				result.match(/Content-Type: text\/x-shellscript/g) || []
			).length;
			expect(cloudConfigCount).toBe(2);
			expect(shellscriptCount).toBe(1);
			expect(result).toContain("SANDCTL BEGIN GLOBAL CLOUD-INIT");
			expect(result).toContain("SANDCTL BEGIN LAYER 1");
			expect(result).toContain("SANDCTL BEGIN LAYER 2");
		});

		test("normalizes content without trailing newline", () => {
			const base = "#cloud-config\nusers:\n  - name: agent";
			const layer = "#!/bin/bash\necho hello";
			const result = assembleUserData(base, [layer]);

			// Boundaries should still appear on their own lines
			expect(result).toContain("--==SANDCTL==\nContent-Type:");
			expect(result).toContain("--==SANDCTL==--");
		});

		test("injects merge_how into cloud-config layers", () => {
			const base = "#cloud-config\nusers:\n  - name: agent\n";
			const layer = "#cloud-config\npackages:\n  - git\n";
			const result = assembleUserData(base, [layer]);

			expect(result).toContain("merge_how:");
			expect(result).toContain("append");
		});

		test("does not inject merge_how into the global base", () => {
			const base = "#cloud-config\nusers:\n  - name: agent\n";
			const layer = "#cloud-config\npackages:\n  - git\n";
			const result = assembleUserData(base, [layer]);

			// Split by boundary, the first cloud-config part (global base) should not have merge_how
			const parts = result.split("--==SANDCTL==");
			const basePart = parts[1]; // first part after initial boundary
			expect(basePart).not.toContain("merge_how");
		});

		test("does not inject merge_how into shell script layers", () => {
			const base = "#cloud-config\nusers:\n  - name: agent\n";
			const layer = "#!/bin/bash\necho hello\n";
			const result = assembleUserData(base, [layer]);

			expect(result).not.toContain("merge_how");
		});

		test("preserves existing merge_how in layers", () => {
			const base = "#cloud-config\nusers:\n  - name: agent\n";
			const layer =
				"#cloud-config\nmerge_how:\n  - name: list\n    settings: [replace]\n";
			const result = assembleUserData(base, [layer]);

			// Should have exactly one merge_how (the user's own)
			const count = (result.match(/merge_how:/g) || []).length;
			expect(count).toBe(1);
			expect(result).toContain("replace");
		});
	});
});
