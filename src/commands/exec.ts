import { Command } from "commander";
import {
	assertRunnable,
	buildSSHOptions,
	CommandExitError,
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
import { openConsole } from "@/ssh/console";
import { type ExecResult, exec } from "@/ssh/exec";

export { CommandExitError };

interface ExecOptions {
	command?: string;
}

interface WritableLike {
	write(chunk: string | Uint8Array): boolean;
}

interface Dependencies {
	store: SessionStoreLike;
	loadConfig: (configPath?: string) => Promise<Config>;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
	runRemoteCommand: (
		client: SSHClientLike,
		command: string,
	) => Promise<ExecResult>;
	openRemoteConsole: (client: SSHClientLike) => Promise<void>;
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

	const session = await lookupSession(name, dependencies.store);
	assertRunnable(session);

	const config = await dependencies.loadConfig(configPath);
	const client = dependencies.createSSHClient(
		buildSSHOptions(config, session.ip_address),
	);

	return withSSHClient(client, async (c) => {
		const commandProvided = Object.hasOwn(options, "command");
		if (commandProvided) {
			const command = options.command ?? "";
			if (command.trim().length === 0) {
				throw new Error("--command cannot be empty or whitespace");
			}

			const result = await dependencies.runRemoteCommand(c, command);
			if (result.stdout) {
				dependencies.stdout.write(result.stdout);
			}
			if (result.stderr) {
				dependencies.stderr.write(result.stderr);
			}
			return result.exitCode;
		}

		await dependencies.openRemoteConsole(c);
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
							{ exit_code: exitCode, stdout: stdoutBuf, stderr: stderrBuf },
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
