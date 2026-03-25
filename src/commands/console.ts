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
import { type ConsoleOptions, openConsole } from "@/ssh/console";
import { type ExecResult, exec } from "@/ssh/exec";

export { CommandExitError };

interface Dependencies {
	store: SessionStoreLike;
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
}

const defaultDependencies: Dependencies = {
	store: new SessionStore(),
	loadConfig: load,
	createSSHClient: (options) => new SSHClient(options),
	runRemoteCommand: exec,
	openRemoteConsole: openConsole,
};

export async function runConsole(
	name: string,
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<void> {
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

	await withSSHClient(client, async (c) => {
		const hookCommand = config.hooks?.["new-console-session"];
		if (hookCommand) {
			try {
				const result = await dependencies.runRemoteCommand(c, hookCommand);
				if (result.stderr) {
					console.error(result.stderr);
				}
				if (result.exitCode !== 0) {
					console.warn(
						`Warning: new-console-session hook exited with code ${result.exitCode}`,
					);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.warn(`Warning: new-console-session hook failed: ${message}`);
			}
		}
		await dependencies.openRemoteConsole(c, {
			initialCommands: config.post_ssh_commands,
		});
	});
}

export function registerConsoleCommand(): Command {
	return new Command("ssh")
		.description("Open an interactive SSH console to a running session")
		.argument("<name>")
		.action(async (name: string, _options: unknown, command: Command) => {
			const globals = command.optsWithGlobals() as { config?: string };
			await runConsole(name, {}, globals.config);
		});
}
