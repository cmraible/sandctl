import { Command } from "commander";

import { resolveSession, assertRunnable } from "@/core/sessions";
import {
	CommandExitError,
	mapDomainError,
	type SSHRuntimeClient,
	buildSSHOptions,
	withSSHClient,
} from "@/commands/shared/session-runtime";
import type { SessionStoreReader } from "@/core/types";
import { type Config, load } from "@/config/config";
import { SessionStore } from "@/session/store";
import {
	SSHClient,
	type SSHClientLike,
	type SSHClientOptions,
} from "@/ssh/client";
import { type ConsoleOptions, openConsole } from "@/ssh/console";

export { CommandExitError };

interface Dependencies {
	store: SessionStoreReader;
	loadConfig: (configPath?: string) => Promise<Config>;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
	openRemoteConsole: (
		client: SSHClientLike,
		options?: ConsoleOptions,
	) => Promise<void>;
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

	let session;
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

	await withSSHClient(client, async (c) => {
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
