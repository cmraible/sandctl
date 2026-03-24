import { confirm } from "@inquirer/prompts";
import { Command } from "commander";

import {
	destroySession,
	resolveSession,
	type DestroyResult,
} from "@/core/sessions";
import {
	ProviderDeletionError,
	SessionNotFoundError,
	ValidationError,
} from "@/core/errors";
import {
	type Config,
	getProviderConfig,
	load,
	type ProviderConfig,
} from "@/config/config";
import { getProvider } from "@/provider";
import { get as getProviderFromRegistry } from "@/provider/registry";
import { SessionStore } from "@/session/store";

import { CommandExitError, mapDomainError } from "@/commands/shared/session-runtime";

export { CommandExitError, type DestroyResult };

interface Dependencies {
	loadConfig: (configPath?: string) => Promise<Config>;
	resolveProvider: (
		name: string,
		config: ProviderConfig,
	) => ReturnType<typeof getProviderFromRegistry>;
	resolveLegacyProvider: typeof getProvider;
}

const defaultDependencies: Dependencies = {
	loadConfig: load,
	resolveProvider: getProviderFromRegistry,
	resolveLegacyProvider: getProvider,
};

export async function runDestroy(
	name: string,
	options: { force: boolean; silent?: boolean },
	store = new SessionStore(),
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<DestroyResult> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	// If not forcing, look up session and prompt for confirmation
	if (!options.force) {
		let session;
		try {
			session = await resolveSession(name, store);
		} catch (error) {
			mapDomainError(error);
		}

		if (session.provider_id) {
			const accepted = await confirm({
				message: `Destroy session '${session.id}'? This cannot be undone.`,
				default: false,
			});
			if (!accepted) {
				if (!options.silent) {
					console.log("Canceled.");
				}
				return { id: session.id, destroyed: false };
			}
		}
	}

	try {
		const result = await destroySession(
			name,
			{ force: options.force },
			{
				store,
				loadConfig: dependencies.loadConfig,
				resolveProvider: dependencies.resolveProvider,
				resolveLegacyProvider: dependencies.resolveLegacyProvider,
				warn: (msg) => console.warn(msg),
			},
			configPath,
		);
		if (!options.silent) {
			console.log(`Session '${result.id}' destroyed.`);
		}
		return result;
	} catch (error) {
		if (error instanceof ProviderDeletionError) {
			throw new Error(error.message);
		}
		mapDomainError(error);
	}
}

export function registerDestroyCommand(): Command {
	return new Command("destroy")
		.aliases(["rm", "delete"])
		.description("Terminate and remove a session")
		.argument("<name>")
		.option("-f, --force", "Skip confirmation prompt", false)
		.action(async (name: string, options: { force: boolean }, command) => {
			const globals = command.optsWithGlobals() as {
				config?: string;
				json?: boolean;
			};
			if (globals.json) {
				options.force = true;
			}
			const result = await runDestroy(
				name,
				{ ...options, silent: globals.json },
				undefined,
				undefined,
				globals.config,
			);
			if (globals.json) {
				console.log(JSON.stringify(result, null, 2));
			}
		});
}
