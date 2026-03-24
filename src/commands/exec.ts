import { Command } from "commander";
import {
	buildSSHOptions,
	CommandExitError,
	mapDomainError,
	type SSHRuntimeClient,
	withSSHClient,
} from "@/commands/shared/session-runtime";
import { type Config, load } from "@/config/config";
import { assertRunnable, resolveSession } from "@/core/sessions";
import { execCommand } from "@/core/ssh";
import type { SessionStoreReader } from "@/core/types";
import { SessionStore } from "@/session/store";
import {
	SSHClient,
	type SSHClientLike,
	type SSHClientOptions,
} from "@/ssh/client";
import { type ConsoleOptions, openConsole } from "@/ssh/console";
import { type ExecResult, exec } from "@/ssh/exec";

export { CommandExitError };

interface ExecOptions {
	command?: string;
}

interface WritableLike {
	write(chunk: string | Uint8Array): boolean;
}

interface Dependencies {
	store: SessionStoreReader;
	loadConfig: (configPath?: string) => Promise<Config>;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
	runRemoteCommand: (
		client: SSHClientLike,
		command: string,
	) => Promise<ExecResult>;
	openRemoteConsole: (
		client: SSHClientLike,
		options?: ConsoleOptions,
	) => Promise<void>;
	stdout: WritableLike;
	stderr: WritableLike;
}

const defaultDependencies: Dependencies = {
	store: new SessionStore(),
	loadConfig: load,
	createSSHClient: (options) => new SSHClient(options),
	runRemoteCommand: exec,
	openRemoteConsole: openConsole,
	stdout: process.stdout,
	stderr: process.stderr,
};

export async function runExec(
	name: string,
	options: ExecOptions,
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<number> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	const commandProvided = Object.hasOwn(options, "command");
	if (commandProvided) {
		const command = options.command ?? "";
		if (command.trim().length === 0) {
			throw new Error("--command cannot be empty or whitespace");
		}

		try {
			const result = await execCommand(
				name,
				command,
				{
					store: dependencies.store,
					loadConfig: dependencies.loadConfig,
					createSSHClient: dependencies.createSSHClient,
					runRemoteCommand: dependencies.runRemoteCommand,
				},
				configPath,
			);
			if (result.stdout) {
				dependencies.stdout.write(result.stdout);
			}
			if (result.stderr) {
				dependencies.stderr.write(result.stderr);
			}
			return result.exitCode;
		} catch (error) {
			mapDomainError(error);
		}
	}

	// No command provided — open interactive console
	let session: Awaited<ReturnType<typeof resolveSession>>;
	try {
		session = await resolveSession(name, dependencies.store);
		assertRunnable(session);
	} catch (error) {
		mapDomainError(error);
	}

	const config = await dependencies.loadConfig(configPath);
	const client = dependencies.createSSHClient(
		buildSSHOptions(config, session.ip_address),
	);

	return withSSHClient(client, async (c) => {
		await dependencies.openRemoteConsole(c, {
			initialCommands: config.post_ssh_commands,
		});
		return 0;
	});
}

export function registerExecCommand(): Command {
	return new Command("exec")
		.description("Execute a command in a running session")
		.argument("<name>")
		.option("-c, --command <command>", "Run a single command")
		.action(
			async (
				name: string,
				options: ExecOptions,
				command: Command,
			): Promise<void> => {
				const globals = command.optsWithGlobals() as {
					config?: string;
					json?: boolean;
				};

				if (globals.json && options.command) {
					let stdoutBuf = "";
					let stderrBuf = "";
					const exitCode = await runExec(
						name,
						options,
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
								exit_code: exitCode,
								stdout: stdoutBuf,
								stderr: stderrBuf,
							},
							null,
							2,
						),
					);
					if (exitCode !== 0) {
						process.exitCode = exitCode;
					}
					return;
				}

				const exitCode = await runExec(name, options, {}, globals.config);
				if (exitCode !== 0) {
					process.exitCode = exitCode;
				}
			},
		);
}
