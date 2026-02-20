import { spawnSync } from "node:child_process";

export interface CliResult {
	code: number;
	stdout: string;
	stderr: string;
}

export function runBinary(args: string[]): CliResult {
	const result = spawnSync("./sandctl", args, { encoding: "utf8" });

	return {
		code: result.status ?? 1,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}
