import { spawnSync } from "node:child_process";

export interface CliResult {
	code: number;
	stdout: string;
	stderr: string;
}

export interface RunBinaryOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	stdin?: string;
	timeoutMs?: number;
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

export function shouldRunLiveSmoke(env: NodeJS.ProcessEnv): boolean {
	return env.SANDCTL_LIVE_SMOKE === "1" && Boolean(env.HETZNER_API_TOKEN);
}

export function runBinary(
	args: string[],
	options: RunBinaryOptions = {},
): CliResult {
	const result = spawnSync("./sandctl", args, {
		encoding: "utf8",
		cwd: options.cwd,
		env: buildSpawnEnv(options.env),
		input: options.stdin,
		timeout: options.timeoutMs,
	});

	return {
		code: result.status ?? 1,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}
