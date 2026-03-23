import { Command } from "commander";

import {
	type Config,
	getProviderConfig,
	load,
	type ProviderConfig,
} from "@/config/config";
import { get as getProviderFromRegistry } from "@/provider/registry";
import { normalizeName, validateID } from "@/session/id";
import { SessionStore } from "@/session/store";
import { NotFoundError } from "@/session/types";
import { SSHClient, type SSHClientOptions } from "@/ssh/client";
import { exec as sshExec } from "@/ssh/exec";
import {
	buildSSHOptions,
	type SSHRuntimeClient,
	withSSHClient,
} from "./shared/session-runtime";

export class CommandExitError extends Error {
	constructor(
		message: string,
		readonly exitCode: number,
	) {
		super(message);
	}
}

interface SessionStoreLike {
	get: (id: string) => Promise<{
		id: string;
		status: string;
		provider: string;
		provider_id: string;
		ip_address: string;
	}>;
	rename: (oldId: string, newId: string) => Promise<void>;
}

interface ProviderLike {
	client: {
		updateServer: (id: string, updates: { name: string }) => Promise<unknown>;
	};
}

interface Dependencies {
	store: SessionStoreLike;
	loadConfig: (configPath?: string) => Promise<Config>;
	resolveProvider: (
		name: string,
		config: ProviderConfig,
	) => ReturnType<typeof getProviderFromRegistry>;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
}

const defaultDependencies: Dependencies = {
	store: new SessionStore(),
	loadConfig: load,
	resolveProvider: getProviderFromRegistry,
	createSSHClient: (options) => new SSHClient(options),
};

export interface RenameResult {
	old_id: string;
	new_id: string;
}

export async function runRename(
	oldName: string,
	newName: string,
	options: { silent?: boolean },
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<RenameResult> {
	const dependencies = { ...defaultDependencies, ...deps };

	const normalizedOld = normalizeName(oldName);
	const normalizedNew = normalizeName(newName);

	if (!validateID(normalizedOld)) {
		throw new Error(`invalid session name format: ${oldName}`);
	}
	if (!validateID(normalizedNew)) {
		throw new Error(`invalid session name format: ${newName}`);
	}
	if (normalizedOld === normalizedNew) {
		throw new Error("new name is the same as the current name");
	}

	const session = await dependencies.store
		.get(normalizedOld)
		.catch((error: unknown) => {
			if (error instanceof NotFoundError) {
				throw new CommandExitError(
					`Session '${normalizedOld}' not found. Use 'sandctl list' to see available sessions.`,
					4,
				);
			}
			throw error;
		});

	// Load config once for provider rename and hostname update
	let config: Config | undefined;
	try {
		config = await dependencies.loadConfig(configPath);
	} catch {
		// Config loading is best-effort
	}

	// Rename on the provider (best-effort)
	if (session.provider_id && config) {
		try {
			const providerConfig = getProviderConfig(config, session.provider);
			if (providerConfig) {
				const provider = dependencies.resolveProvider(
					session.provider,
					providerConfig,
				) as ProviderLike;
				await provider.client.updateServer(session.provider_id, {
					name: normalizedNew,
				});
			}
		} catch {
			// Provider rename is best-effort — local rename still proceeds
		}
	}

	// Update hostname on the VM (best-effort, only if running with an IP)
	if (session.status === "running" && session.ip_address && config) {
		try {
			const sshOptions = {
				...buildSSHOptions(config, session.ip_address),
				username: "root",
			};
			const client = dependencies.createSSHClient(sshOptions);
			await withSSHClient(client, async (c) => {
				await sshExec(c, `hostnamectl set-hostname ${normalizedNew}`);
			});
		} catch {
			// Hostname update is best-effort — local rename still proceeds
		}
	}

	await dependencies.store.rename(normalizedOld, normalizedNew);

	if (!options.silent) {
		console.log(`Renamed session '${normalizedOld}' to '${normalizedNew}'.`);
	}

	return { old_id: normalizedOld, new_id: normalizedNew };
}

export function registerRenameCommand(): Command {
	return new Command("rename")
		.description("Rename a session")
		.argument("<current-name>", "Current session name")
		.argument("<new-name>", "New session name")
		.action(
			async (
				currentName: string,
				newName: string,
				_options: unknown,
				command: Command,
			) => {
				const globals = command.optsWithGlobals() as {
					config?: string;
					json?: boolean;
				};
				const result = await runRename(
					currentName,
					newName,
					{ silent: globals.json },
					undefined,
					globals.config,
				);
				if (globals.json) {
					console.log(JSON.stringify(result, null, 2));
				}
			},
		);
}
