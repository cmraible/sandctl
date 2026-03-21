import { describe, expect, test } from "bun:test";

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

		test("copies SSH keys from root to agent user", () => {
			const output = generateCloudInit();
			expect(output).toContain(
				"cp /root/.ssh/authorized_keys /home/agent/.ssh/authorized_keys",
			);
		});

		test("is a minimal base without packages or docker", () => {
			const output = generateCloudInit();
			expect(output).not.toContain("package_update");
			expect(output).not.toContain("docker");
			expect(output).not.toContain("nodejs");
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
			expect(result).toBe(base);
		});

		test("returns plain cloud-config with empty layers array", () => {
			const base = "#cloud-config\nusers:\n  - name: agent\n";
			const result = assembleUserData(base, []);
			expect(result).toBe(base);
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
		});

		test("normalizes content without trailing newline", () => {
			const base = "#cloud-config\nusers:\n  - name: agent";
			const layer = "#!/bin/bash\necho hello";
			const result = assembleUserData(base, [layer]);

			// Boundaries should still appear on their own lines
			expect(result).toContain("--==SANDCTL==\nContent-Type:");
			expect(result).toContain("--==SANDCTL==--");
		});
	});
});
