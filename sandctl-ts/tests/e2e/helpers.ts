import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface CliResult {
	/** Exit code, or null if the process was killed by a signal (e.g. timeout). */
	code: number | null;
	stdout: string;
	stderr: string;
}

export interface RunBinaryOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	stdin?: string;
	timeoutMs?: number;
}

export interface TempHomeConfigOptions {
	configContent?: string;
	sessionsContent?: string;
}

const ALLOWED_BASE_ENV_KEYS = [
	"PATH",
	"HOME",
	"TMPDIR",
	"TMP",
	"TEMP",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"TERM",
	"CI",
	"GITHUB_ACTIONS",
	"SSH_AUTH_SOCK",
	"SSH_AGENT_PID",
] as const;

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..");
const COMPILED_BINARY_PATH = path.join(PROJECT_ROOT, "sandctl");

function buildSpawnEnv(overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};

	for (const key of ALLOWED_BASE_ENV_KEYS) {
		const value = process.env[key];
		if (value !== undefined) {
			env[key] = value;
		}
	}

	return {
		...env,
		...overrides,
	};
}

export function makeTempHome(prefix = "sandctl-e2e-"): string {
	const homeDir = mkdtempSync(path.join(tmpdir(), prefix));
	mkdirSync(path.join(homeDir, ".sandctl"), { recursive: true, mode: 0o700 });
	return homeDir;
}

export function cleanupTempHome(homeDir: string): void {
	rmSync(homeDir, { recursive: true, force: true });
}

export function defaultConfigFixture(): string {
	return [
		"default_provider: hetzner",
		"ssh_key_source: agent",
		"providers:",
		"  hetzner:",
		"    token: test-token",
		"    region: ash",
		"    server_type: cpx31",
		"    image: ubuntu-24.04",
	].join("\n");
}

export function writeConfigFixture(
	homeDir: string,
	configContent = defaultConfigFixture(),
): string {
	const sandctlDir = path.join(homeDir, ".sandctl");
	mkdirSync(sandctlDir, { recursive: true, mode: 0o700 });
	const configPath = path.join(sandctlDir, "config");
	writeFileSync(configPath, `${configContent.trimEnd()}\n`, { mode: 0o600 });
	return configPath;
}

export function writeSessionsFixture(
	homeDir: string,
	sessionsContent = "[]",
): string {
	const sandctlDir = path.join(homeDir, ".sandctl");
	mkdirSync(sandctlDir, { recursive: true, mode: 0o700 });
	const sessionsPath = path.join(sandctlDir, "sessions.json");
	writeFileSync(sessionsPath, `${sessionsContent.trimEnd()}\n`, {
		mode: 0o600,
	});
	return sessionsPath;
}

export function makeTempHomeWithConfig(
	options: TempHomeConfigOptions = {},
): string {
	const homeDir = makeTempHome();
	writeConfigFixture(homeDir, options.configContent);
	if (options.sessionsContent !== undefined) {
		writeSessionsFixture(homeDir, options.sessionsContent);
	}
	return homeDir;
}

export function shouldRunLiveSmoke(env: NodeJS.ProcessEnv): boolean {
	return env.SANDCTL_LIVE_SMOKE === "1" && Boolean(env.HETZNER_API_TOKEN);
}

export function ensureCompiledBinary(): string {
	if (!existsSync(COMPILED_BINARY_PATH)) {
		throw new Error(
			`compiled sandctl e2e binary not found at ${COMPILED_BINARY_PATH}; run "bun run build" in sandctl-ts before running e2e tests`,
		);
	}

	return COMPILED_BINARY_PATH;
}

export function hasCompiledBinary(): boolean {
	return existsSync(COMPILED_BINARY_PATH);
}

export function runBinary(
	args: string[],
	options: RunBinaryOptions = {},
): CliResult {
	const result = spawnSync(ensureCompiledBinary(), args, {
		encoding: "utf8",
		cwd: options.cwd,
		env: buildSpawnEnv(options.env),
		input: options.stdin,
		timeout: options.timeoutMs,
	});

	return {
		// result.status is null when the process was killed by a signal (e.g.
		// spawnSync timeout fires SIGTERM).  Propagate null so callers can
		// distinguish a signal-kill from a clean non-zero exit.
		code: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

/**
 * Write a minimal fake SSH public key to <homeDir>/.ssh/id_ed25519.pub so
 * that the agent-mode key fallback in getSSHPublicKey() succeeds without
 * needing a real SSH agent or key file from the host environment.
 */
export function seedSshPublicKey(homeDir: string): void {
	const sshDir = path.join(homeDir, ".ssh");
	mkdirSync(sshDir, { recursive: true, mode: 0o700 });
	// Minimal structurally-valid OpenSSH public key (fake, not usable for auth)
	const fakeKey =
		"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyForContractTestDoNotUse sandctl-contract-test\n";
	writeFileSync(path.join(sshDir, "id_ed25519.pub"), fakeKey, {
		mode: 0o644,
	});
}
