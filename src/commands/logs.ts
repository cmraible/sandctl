import { spawn } from "node:child_process";
import { Command } from "commander";
import {
	assertRunnable,
	buildSSHOptions,
	lookupSession,
	type SessionStoreLike,
	type SSHRuntimeClient,
	withSSHClient,
} from "@/commands/shared/session-runtime";
import { type Config, load } from "@/config/config";
import { SessionStore } from "@/session/store";
import {
	SSHClient,
	type SSHClientLike,
	type SSHClientOptions,
} from "@/ssh/client";
import { type ExecResult, exec, execWithStreamingOutput } from "@/ssh/exec";

const LOG_FILE = "/var/log/cloud-init-output.log";

interface LogsOptions {
	follow?: boolean;
	lines?: string;
	noPager?: boolean;
	pager?: boolean;
}

interface Dependencies {
	store: SessionStoreLike;
	loadConfig: (configPath?: string) => Promise<Config>;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
	runCommand: (client: SSHClientLike, command: string) => Promise<ExecResult>;
	runStreamingCommand: (
		client: SSHClientLike,
		command: string,
		options: {
			onStdout?: (data: string) => void;
			onStderr?: (data: string) => void;
		},
	) => Promise<ExecResult>;
	stdout: {
		write(chunk: string | Uint8Array): boolean;
		isTTY?: boolean;
	};
	stderr: {
		write(chunk: string | Uint8Array): boolean;
		isTTY?: boolean;
	};
	pageOutput: (content: string) => Promise<void>;
}

const defaultDependencies: Dependencies = {
	store: new SessionStore(),
	loadConfig: load,
	createSSHClient: (options) => new SSHClient(options),
	runCommand: exec,
	runStreamingCommand: (client, command, options) =>
		execWithStreamingOutput(client, command, {
			onStdout: options.onStdout,
			onStderr: options.onStderr,
		}),
	stdout: process.stdout,
	stderr: process.stderr,
	pageOutput: defaultPageOutput,
};

function buildCommand(options: LogsOptions): string {
	if (options.follow) {
		const lines = options.lines ?? "10";
		return `tail -n ${lines} -f ${LOG_FILE}`;
	}
	if (options.lines) {
		return `tail -n ${options.lines} ${LOG_FILE}`;
	}
	return `cat ${LOG_FILE}`;
}

function parseCommand(command: string): { command: string; args: string[] } | null {
	const trimmed = command.trim();
	if (!trimmed) {
		return null;
	}

	const parts = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
	if (!parts || parts.length === 0) {
		return null;
	}

	const [rawCommand, ...rawArgs] = parts;
	const unquote = (value: string) => {
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			return value.slice(1, -1);
		}
		return value;
	};

	return {
		command: unquote(rawCommand),
		args: rawArgs.map(unquote),
	};
}

function pagerCommand(): { command: string; args: string[] } {
	const fromEnv = process.env.PAGER?.trim();
	if (fromEnv) {
		const parsed = parseCommand(fromEnv);
		if (parsed) {
			return parsed;
		}
	}

	return { command: "less", args: ["-R"] };
}

async function defaultPageOutput(content: string): Promise<void> {
	const pager = pagerCommand();

	await new Promise<void>((resolve) => {
		const child = spawn(pager.command, pager.args, {
			stdio: ["pipe", "inherit", "inherit"],
		});

		child.on("error", () => {
			process.stdout.write(content);
			resolve();
		});

		child.on("close", () => {
			resolve();
		});

		child.stdin.write(content);
		child.stdin.end();
	});
}

export async function runLogs(
	name: string,
	options: LogsOptions = {},
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<ExecResult> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	const session = await lookupSession(name, dependencies.store);
	assertRunnable(session);

	const config = await dependencies.loadConfig(configPath);
	const client = dependencies.createSSHClient(
		{
			...buildSSHOptions(config, session.ip_address),
			username: "root",
		},
	);

	const command = buildCommand(options);

	return withSSHClient(client, async (c) => {
		if (options.follow) {
			return await dependencies.runStreamingCommand(c, command, {
				onStdout: (data) => dependencies.stdout.write(data),
				onStderr: (data) => dependencies.stderr.write(data),
			});
		}

		const result = await dependencies.runCommand(c, command);
		if (result.stdout) {
			const pagerDisabled = options.noPager || options.pager === false;
			if (dependencies.stdout.isTTY && !pagerDisabled) {
				await dependencies.pageOutput(result.stdout);
			} else {
				dependencies.stdout.write(result.stdout);
			}
		}
		if (result.stderr) {
			dependencies.stderr.write(result.stderr);
		}
		return result;
	});
}

export function registerLogsCommand(): Command {
	return new Command("logs")
		.description("Show cloud-init logs from a session")
		.argument("<name>")
		.option("-f, --follow", "Follow log output in real-time")
		.option("-n, --lines <lines>", "Number of lines to show")
		.option("--no-pager", "Write logs directly to stdout without paging")
		.action(async (name: string, options: LogsOptions, command: Command) => {
			const globals = command.optsWithGlobals() as {
				config?: string;
				json?: boolean;
			};

			if (globals.json) {
				let stdoutBuf = "";
				let stderrBuf = "";
				const result = await runLogs(
					name,
					{ ...options, follow: false },
					{
						stdout: {
							write(chunk: string | Uint8Array) {
								stdoutBuf += chunk.toString();
								return true;
							},
						},
						stderr: {
							write(chunk: string | Uint8Array) {
								stderrBuf += chunk.toString();
								return true;
							},
						},
					},
					globals.config,
				);
				console.log(
					JSON.stringify(
						{
							session: name,
							logs: stdoutBuf,
							stderr: stderrBuf,
							exit_code: result.exitCode,
						},
						null,
						2,
					),
				);
				if (result.exitCode !== 0) {
					process.exitCode = result.exitCode;
				}
				return;
			}

			const result = await runLogs(name, options, {}, globals.config);
			if (result.exitCode !== 0) {
				process.exitCode = result.exitCode;
			}
		});
}
