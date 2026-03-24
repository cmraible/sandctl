import { Command } from "commander";

import { renameSession, type RenameResult } from "@/core/sessions";
import { mapDomainError } from "@/commands/shared/session-runtime";
import {
	type Config,
	load,
	type ProviderConfig,
} from "@/config/config";
import { get as getProviderFromRegistry } from "@/provider/registry";
import { SessionStore } from "@/session/store";

export { type RenameResult };

export { CommandExitError } from "@/commands/shared/session-runtime";

interface Dependencies {
	store: {
		get: (id: string) => Promise<{
			id: string;
			provider: string;
			provider_id: string;
		}>;
		rename: (oldId: string, newId: string) => Promise<void>;
	};
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

export async function runRename(
	oldName: string,
	newName: string,
	options: { silent?: boolean },
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<RenameResult> {
	const dependencies = { ...defaultDependencies, ...deps };

	try {
		const result = await renameSession(
			oldName,
			newName,
			{
				store: dependencies.store,
				loadConfig: dependencies.loadConfig,
				resolveProvider: dependencies.resolveProvider,
			},
			configPath,
		);

		if (!options.silent) {
			console.log(
				`Renamed session '${result.old_id}' to '${result.new_id}'.`,
			);
		}

		return result;
	} catch (error) {
		mapDomainError(error);
	}
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
