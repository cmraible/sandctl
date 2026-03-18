import { describe, expect, test } from "bun:test";

import {
	generateCloudInit,
	generatePostSnapshotSSHSetup,
} from "@/hetzner/setup";

describe("hetzner/setup", () => {
	describe("generateCloudInit", () => {
		test("installs Node.js via NodeSource", () => {
			const output = generateCloudInit();
			expect(output).toContain("nodesource.com/setup_22.x");
			expect(output).toContain("apt-get install -y nodejs");
		});

		test("installs Claude Code globally", () => {
			const output = generateCloudInit();
			expect(output).toContain("npm install -g @anthropic-ai/claude-code");
		});

		test("creates agent user with docker and sudo groups", () => {
			const output = generateCloudInit();
			expect(output).toContain("name: agent");
			expect(output).toContain("docker");
			expect(output).toContain("sudo");
		});

		test("installs Docker Engine", () => {
			const output = generateCloudInit();
			expect(output).toContain("docker-ce");
		});

		test("installs GitHub CLI", () => {
			const output = generateCloudInit();
			expect(output).toContain("apt-get install -y gh");
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
});
