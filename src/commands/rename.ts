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
		provider: string;
		provider_id: string;
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
}

const defaultDependencies: Dependencies = {
	store: new SessionStore(),
	loadConfig: load,
	resolveProvider: getProviderFromRegistry,
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

	// Rename on the provider (best-effort)
	if (session.provider_id) {
		try {
			const config = await dependencies.loadConfig(configPath);
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
