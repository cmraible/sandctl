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
import { type ExecResult, exec } from "@/ssh/exec";
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

interface ExecOptions {
	command?: string;
}

interface SessionStoreLike {
	get(id: string): Promise<Session>;
}

interface WritableLike {
	write(chunk: string | Uint8Array): boolean;
}

interface SSHRuntimeClient extends SSHClientLike {
	connect(): Promise<void>;
	close(): Promise<void>;
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
		const commandProvided = Object.hasOwn(options, "command");
		if (commandProvided) {
			const command = options.command ?? "";
			if (command.trim().length === 0) {
				throw new Error("--command cannot be empty or whitespace");
			}

			const result = await dependencies.runRemoteCommand(client, command);
			if (result.stdout) {
				dependencies.stdout.write(result.stdout);
			}
			if (result.stderr) {
				dependencies.stderr.write(result.stderr);
			}
			return result.exitCode;
		}

		await dependencies.openRemoteConsole(client);
		return 0;
	} finally {
		await client.close();
	}
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
				const globals = command.optsWithGlobals() as { config?: string };
				const exitCode = await runExec(name, options, {}, globals.config);
				if (exitCode !== 0) {
					process.exitCode = exitCode;
				}
			},
		);
}
