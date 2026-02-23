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

export { CommandExitError };

interface Dependencies {
	store: SessionStoreLike;
	loadConfig: (configPath?: string) => Promise<Config>;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
	openRemoteConsole: (client: SSHClientLike) => Promise<void>;
}

const defaultDependencies: Dependencies = {
	store: new SessionStore(),
	loadConfig: load,
	createSSHClient: (options) => new SSHClient(options),
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
		await dependencies.openRemoteConsole(c);
	});
}

export function registerConsoleCommand(): Command {
	return new Command("console")
		.description("Open an interactive SSH console to a running session")
		.argument("<name>")
		.action(async (name: string, _options: unknown, command: Command) => {
			const globals = command.optsWithGlobals() as { config?: string };
			await runConsole(name, {}, globals.config);
		});
}
