import { Command } from "commander";

import { type Config, load } from "@/config/config";
import { normalizeName, validateID } from "@/session/id";
import { SessionStore } from "@/session/store";
import { NotFoundError, type Session } from "@/session/types";
import {
	SSHClient,
	type SSHClientLike,
	type SSHClientOptions,
} from "@/ssh/client";
import { openConsole } from "@/ssh/console";
import { expandTilde } from "@/utils/paths";

const EXIT_SESSION_NOT_FOUND = 4;
const EXIT_SESSION_NOT_READY = 5;

export class CommandExitError extends Error {
	constructor(
		message: string,
		readonly exitCode: number,
	) {
		super(message);
	}
}

interface SessionStoreLike {
	get(id: string): Promise<Session>;
}

interface SSHRuntimeClient extends SSHClientLike {
	connect(): Promise<void>;
	close(): Promise<void>;
}

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

function sshOptions(config: Config, host: string): SSHClientOptions {
	if (config.ssh_key_source === "agent") {
		return {
			host,
			username: "root",
			useAgent: true,
		};
	}

	if (!config.ssh_public_key) {
		throw new Error("ssh_public_key not configured");
	}

	const publicKeyPath = expandTilde(config.ssh_public_key);
	const privateKeyPath = publicKeyPath.endsWith(".pub")
		? publicKeyPath.slice(0, -4)
		: publicKeyPath;

	return {
		host,
		username: "root",
		privateKeyPath,
	};
}

function assertRunnable(session: Session): void {
	if (session.status !== "running") {
		throw new CommandExitError(
			`Session '${session.id}' is not running (status: ${session.status}).`,
			EXIT_SESSION_NOT_READY,
		);
	}
	if (!session.ip_address) {
		throw new CommandExitError(
			`Session '${session.id}' has no IP address.`,
			EXIT_SESSION_NOT_READY,
		);
	}
}

export async function runConsole(
	name: string,
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<void> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	const normalized = normalizeName(name);
	if (!validateID(normalized)) {
		throw new Error(`invalid session name format: ${name}`);
	}

	const session = await dependencies.store
		.get(normalized)
		.catch((error: unknown) => {
			if (error instanceof NotFoundError) {
				throw new CommandExitError(
					`Session '${normalized}' not found. Use 'sandctl list' to see available sessions.`,
					EXIT_SESSION_NOT_FOUND,
				);
			}
			throw error;
		});

	assertRunnable(session);

	const config = await dependencies.loadConfig(configPath);
	const client = dependencies.createSSHClient(
		sshOptions(config, session.ip_address),
	);
	await client.connect();

	try {
		await dependencies.openRemoteConsole(client);
	} finally {
		await client.close();
	}
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
