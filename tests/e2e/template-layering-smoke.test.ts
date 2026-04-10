import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runBinary, shouldRunLiveSmoke } from "./helpers";

interface SessionRecord {
	id: string;
}

const NEW_TIMEOUT_MS = 10 * 60 * 1000;
const LIST_TIMEOUT_MS = 60 * 1000;
const EXEC_TIMEOUT_MS = 2 * 60 * 1000;
const DESTROY_TIMEOUT_MS = 5 * 60 * 1000;
const TEST_TIMEOUT_MS =
	3 * NEW_TIMEOUT_MS +
	3 * LIST_TIMEOUT_MS +
	6 * EXEC_TIMEOUT_MS +
	3 * DESTROY_TIMEOUT_MS +
	60_000;

function quoteYamlScalar(value: string): string {
	return JSON.stringify(value);
}

function generateSSHKeyPair(dir: string): string {
	const keyPath = path.join(dir, "id_ed25519");
	const keygen = spawnSync(
		"ssh-keygen",
		["-t", "ed25519", "-f", keyPath, "-N", "", "-q"],
		{ encoding: "utf8" },
	);
	if ((keygen.status ?? 1) !== 0) {
		throw new Error(`ssh-keygen failed: ${keygen.stderr}`);
	}
	return `${keyPath}.pub`;
}

function writeConfig(
	configPath: string,
	token: string,
	sshPublicKey: string,
): void {
	const config = [
		`default_provider: ${quoteYamlScalar("hetzner")}`,
		`ssh_public_key: ${quoteYamlScalar(sshPublicKey)}`,
		"providers:",
		"  hetzner:",
		`    token: ${quoteYamlScalar(token)}`,
		`    region: ${quoteYamlScalar("ash")}`,
		`    server_type: ${quoteYamlScalar("cpx11")}`,
		`    image: ${quoteYamlScalar("ubuntu-24.04")}`,
	].join("\n");
	writeFileSync(configPath, `${config}\n`, { mode: 0o600 });
}

function assertCliSuccess(
	step: string,
	result: { code: number | null; stdout: string; stderr: string },
): void {
	if (result.code === 0) {
		return;
	}
	throw new Error(
		`${step} failed with exit code ${result.code}\nstdout:\n${result.stdout || "<empty>"}\nstderr:\n${result.stderr || "<empty>"}`,
	);
}

function setupTestEnv(): {
	homeDir: string;
	configPath: string;
	templatesDir: string;
	env: { HOME: string };
} {
	const token = process.env.HETZNER_API_TOKEN;
	if (!token) {
		throw new Error("HETZNER_API_TOKEN is required");
	}

	const homeDir = mkdtempSync(path.join(tmpdir(), "sandctl-layering-smoke-"));
	const configPath = path.join(homeDir, "config");
	const sshPublicKey =
		process.env.SSH_PUBLIC_KEY && existsSync(process.env.SSH_PUBLIC_KEY)
			? process.env.SSH_PUBLIC_KEY
			: generateSSHKeyPair(homeDir);

	writeConfig(configPath, token, sshPublicKey);

	const templatesDir = path.join(homeDir, ".sandctl", "templates");
	mkdirSync(templatesDir, { recursive: true });

	return { homeDir, configPath, templatesDir, env: { HOME: homeDir } };
}

function writeTemplate(
	templatesDir: string,
	name: string,
	initContent: string,
): void {
	const templateDir = path.join(templatesDir, name);
	mkdirSync(templateDir, { recursive: true });
	writeFileSync(path.join(templateDir, "init"), initContent, { mode: 0o700 });
	writeFileSync(
		path.join(templateDir, "config.yaml"),
		`template: ${name}\noriginal_name: ${name}\ncreated_at: "2026-01-01T00:00:00Z"\n`,
		{ mode: 0o600 },
	);
}

function createSession(
	configPath: string,
	env: { HOME: string },
	extraArgs: string[] = [],
): string {
	const newResult = runBinary(
		["--config", configPath, "--json", "new", "--no-console", ...extraArgs],
		{ env, timeoutMs: NEW_TIMEOUT_MS },
	);
	assertCliSuccess("new", newResult);

	const session = JSON.parse(newResult.stdout) as SessionRecord;
	expect(session.id.length).toBeGreaterThan(0);
	return session.id;
}

function execOnSession(
	configPath: string,
	env: { HOME: string },
	sessionId: string,
	command: string,
): string {
	const result = runBinary(
		["--config", configPath, "exec", sessionId, "-c", command],
		{ env, timeoutMs: EXEC_TIMEOUT_MS },
	);
	assertCliSuccess(`exec: ${command}`, result);
	return result.stdout;
}

function destroySession(
	configPath: string,
	env: { HOME: string },
	sessionId: string,
): void {
	const result = runBinary(
		["--config", configPath, "destroy", sessionId, "--force"],
		{ env, timeoutMs: DESTROY_TIMEOUT_MS },
	);
	assertCliSuccess("destroy", result);
}

describe("template layering live smoke", () => {
	const liveTest = shouldRunLiveSmoke(process.env, "hetzner")
		? test
		: test.skip;

	liveTest(
		"minimal base creates agent user without extras",
		() => {
			const { configPath, env } = setupTestEnv();
			let sessionId: string | undefined;

			try {
				sessionId = createSession(configPath, env);

				// Agent user should exist
				const whoami = execOnSession(configPath, env, sessionId, "whoami");
				expect(whoami.trim()).toBe("agent");

				// Minimal base should NOT have docker or node
				const dockerCheck = runBinary(
					[
						"--config",
						configPath,
						"exec",
						sessionId,
						"-c",
						"which docker || echo NOTFOUND",
					],
					{ env, timeoutMs: EXEC_TIMEOUT_MS },
				);
				expect(dockerCheck.stdout).toContain("NOTFOUND");
			} finally {
				if (sessionId) {
					destroySession(configPath, env, sessionId);
				}
			}
		},
		TEST_TIMEOUT_MS,
	);

	liveTest(
		"cloud-config template installs packages via cloud-init",
		() => {
			const { configPath, templatesDir, env } = setupTestEnv();
			let sessionId: string | undefined;

			// Create a cloud-config template that installs jq
			writeTemplate(
				templatesDir,
				"cloud-test",
				"#cloud-config\npackage_update: true\npackages:\n  - jq\n",
			);

			try {
				sessionId = createSession(configPath, env, ["-T", "cloud-test"]);

				// jq should be installed by cloud-init
				const jqCheck = execOnSession(
					configPath,
					env,
					sessionId,
					"jq --version",
				);
				expect(jqCheck).toContain("jq-");
			} finally {
				if (sessionId) {
					destroySession(configPath, env, sessionId);
				}
			}
		},
		TEST_TIMEOUT_MS,
	);

	liveTest(
		"bash script template runs as cloud-init part",
		() => {
			const { configPath, templatesDir, env } = setupTestEnv();
			let sessionId: string | undefined;

			// Create a bash script template that writes a marker file
			writeTemplate(
				templatesDir,
				"bash-test",
				'#!/bin/bash\necho "sandctl-layering-ok" > /tmp/layering-marker\n',
			);

			try {
				sessionId = createSession(configPath, env, ["-T", "bash-test"]);

				// Marker file should exist from cloud-init execution
				const marker = execOnSession(
					configPath,
					env,
					sessionId,
					"cat /tmp/layering-marker",
				);
				expect(marker.trim()).toBe("sandctl-layering-ok");
			} finally {
				if (sessionId) {
					destroySession(configPath, env, sessionId);
				}
			}
		},
		TEST_TIMEOUT_MS,
	);

	liveTest(
		"user base template and named template both apply",
		() => {
			const { configPath, templatesDir, env } = setupTestEnv();
			let sessionId: string | undefined;

			// User base template: write a marker
			writeTemplate(
				templatesDir,
				"base",
				'#!/bin/bash\necho "base-layer" > /tmp/base-marker\n',
			);

			// Named template: write a different marker
			writeTemplate(
				templatesDir,
				"named-test",
				'#!/bin/bash\necho "named-layer" > /tmp/named-marker\n',
			);

			try {
				sessionId = createSession(configPath, env, ["-T", "named-test"]);

				// Both markers should exist
				const baseMarker = execOnSession(
					configPath,
					env,
					sessionId,
					"cat /tmp/base-marker",
				);
				expect(baseMarker.trim()).toBe("base-layer");

				const namedMarker = execOnSession(
					configPath,
					env,
					sessionId,
					"cat /tmp/named-marker",
				);
				expect(namedMarker.trim()).toBe("named-layer");
			} finally {
				if (sessionId) {
					destroySession(configPath, env, sessionId);
				}
			}
		},
		TEST_TIMEOUT_MS,
	);

	liveTest(
		"legacy init.sh template still works",
		() => {
			const { configPath, templatesDir, env } = setupTestEnv();
			let sessionId: string | undefined;

			// Create a template with legacy init.sh (not init)
			const templateDir = path.join(templatesDir, "legacy-test");
			mkdirSync(templateDir, { recursive: true });
			writeFileSync(
				path.join(templateDir, "init.sh"),
				'#!/bin/bash\necho "legacy-ok" > /tmp/legacy-marker\n',
				{ mode: 0o700 },
			);
			writeFileSync(
				path.join(templateDir, "config.yaml"),
				'template: legacy-test\noriginal_name: legacy-test\ncreated_at: "2026-01-01T00:00:00Z"\n',
				{ mode: 0o600 },
			);

			try {
				sessionId = createSession(configPath, env, ["-T", "legacy-test"]);

				const marker = execOnSession(
					configPath,
					env,
					sessionId,
					"cat /tmp/legacy-marker",
				);
				expect(marker.trim()).toBe("legacy-ok");
			} finally {
				if (sessionId) {
					destroySession(configPath, env, sessionId);
				}
			}
		},
		TEST_TIMEOUT_MS,
	);
});
