import { Command } from "commander";

import { getLogs } from "@/core/ssh";
import { mapDomainError } from "@/commands/shared/session-runtime";
import type { SessionStoreReader } from "@/core/types";
import { type Config, load } from "@/config/config";
import { SessionStore } from "@/session/store";
import {
	SSHClient,
	type SSHClientLike,
	type SSHClientOptions,
	type SSHRuntimeClient,
} from "@/ssh/client";
import { type ExecResult, exec, execWithStreamingOutput } from "@/ssh/exec";

interface LogsOptions {
	follow?: boolean;
	lines?: string;
}

interface Dependencies {
	store: SessionStoreReader;
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

	try {
		const result = await getLogs(
			name,
			{
				follow: options.follow,
				lines: options.lines,
				onStdout: (data) => dependencies.stdout.write(data),
				onStderr: (data) => dependencies.stderr.write(data),
			},
			{
				store: dependencies.store,
				loadConfig: dependencies.loadConfig,
				createSSHClient: dependencies.createSSHClient,
				runCommand: dependencies.runCommand,
				runStreamingCommand: dependencies.runStreamingCommand,
			},
			configPath,
		);

		if (!options.follow) {
			if (result.stdout) {
				dependencies.stdout.write(result.stdout);
			}
			if (result.stderr) {
				dependencies.stderr.write(result.stderr);
			}
		}

		return result;
	} catch (error) {
		mapDomainError(error);
	}
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
