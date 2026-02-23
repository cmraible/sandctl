import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runBinary, shouldRunLiveSmoke } from "./helpers";

interface SessionRecord {
	id: string;
}

const NEW_TIMEOUT_MS = 8 * 60 * 1000;
const LIST_TIMEOUT_MS = 60 * 1000;
const EXEC_TIMEOUT_MS = 2 * 60 * 1000;
const DESTROY_TIMEOUT_MS = 5 * 60 * 1000;
const LIVE_SMOKE_TEST_TIMEOUT_MS =
	NEW_TIMEOUT_MS +
	LIST_TIMEOUT_MS +
	EXEC_TIMEOUT_MS +
	DESTROY_TIMEOUT_MS +
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
	result: { code: number; stdout: string; stderr: string },
): void {
	if (result.code === 0) {
		return;
	}

	throw new Error(
		`${step} failed with exit code ${result.code}\nstdout:\n${result.stdout || "<empty>"}\nstderr:\n${result.stderr || "<empty>"}`,
	);
}

describe("sandctl live smoke gating", () => {
	test("live smoke stays disabled by default", () => {
		expect(shouldRunLiveSmoke({})).toBeFalse();
	});

	const liveSmokeTest = shouldRunLiveSmoke(process.env) ? test : test.skip;

	liveSmokeTest(
		"runs new -> list -> exec -c -> destroy against Hetzner",
		() => {
			if (!existsSync("./sandctl")) {
				throw new Error(
					"live smoke requires ./sandctl binary in current directory",
				);
			}

			const token = process.env.HETZNER_API_TOKEN;
			if (!token) {
				throw new Error(
					"HETZNER_API_TOKEN is required when live smoke is enabled",
				);
			}

			const homeDir = mkdtempSync(path.join(tmpdir(), "sandctl-live-smoke-"));
			const configPath = path.join(homeDir, "config");
			const sshPublicKey =
				process.env.SSH_PUBLIC_KEY && existsSync(process.env.SSH_PUBLIC_KEY)
					? process.env.SSH_PUBLIC_KEY
					: generateSSHKeyPair(homeDir);

			writeConfig(configPath, token, sshPublicKey);

			const env = {
				HOME: homeDir,
			};

			const createdSessionIDs: string[] = [];
			try {
				const newResult = runBinary(["--config", configPath, "new"], {
					env,
					timeoutMs: NEW_TIMEOUT_MS,
				});
				assertCliSuccess("new", newResult);

				const listResult = runBinary(
					["--config", configPath, "list", "--format", "json"],
					{ env, timeoutMs: LIST_TIMEOUT_MS },
				);
				assertCliSuccess("list", listResult);

				const sessions = JSON.parse(listResult.stdout) as SessionRecord[];
				expect(sessions.length).toBeGreaterThan(0);

				const target = sessions[0];
				expect(target.id.length).toBeGreaterThan(0);
				createdSessionIDs.push(target.id);

				const smokeMarker = `sandctl-live-smoke-${randomUUID()}`;
				const execResult = runBinary(
					[
						"--config",
						configPath,
						"exec",
						target.id,
						"-c",
						`echo ${smokeMarker}`,
					],
					{ env, timeoutMs: EXEC_TIMEOUT_MS },
				);
				assertCliSuccess("exec -c", execResult);
				expect(execResult.stdout).toContain(smokeMarker);

				const destroyResult = runBinary(
					["--config", configPath, "destroy", target.id, "--force"],
					{ env, timeoutMs: DESTROY_TIMEOUT_MS },
				);
				assertCliSuccess("destroy", destroyResult);

				const postDestroyList = runBinary(
					["--config", configPath, "list", "--all", "--format", "json"],
					{ env, timeoutMs: LIST_TIMEOUT_MS },
				);
				assertCliSuccess("post-destroy list", postDestroyList);
				const postDestroySessions = JSON.parse(
					postDestroyList.stdout,
				) as SessionRecord[];
				expect(
					postDestroySessions.some((session) => session.id === target.id),
				).toBe(false);
				createdSessionIDs.splice(createdSessionIDs.indexOf(target.id), 1);
			} finally {
				for (const sessionID of createdSessionIDs) {
					runBinary(["--config", configPath, "destroy", sessionID, "--force"], {
						env,
						timeoutMs: DESTROY_TIMEOUT_MS,
					});
				}
			}
		},
		LIVE_SMOKE_TEST_TIMEOUT_MS,
	);
});
