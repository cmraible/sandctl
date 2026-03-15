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
	};
	stderr: {
		write(chunk: string | Uint8Array): boolean;
	};
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
		buildSSHOptions(config, session.ip_address),
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
			dependencies.stdout.write(result.stdout);
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
