import { confirm } from "@inquirer/prompts";
import { Command } from "commander";

import {
	type Config,
	getProviderConfig,
	load,
	type ProviderConfig,
} from "@/config/config";
import { getProvider } from "@/provider";
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

export interface DestroyResult {
	id: string;
	destroyed: boolean;
}

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

	const normalized = normalizeName(name);
	if (!validateID(normalized)) {
		throw new Error(`invalid session name format: ${name}`);
	}

	const session = await store.get(normalized).catch((error: unknown) => {
		if (error instanceof NotFoundError) {
			throw new CommandExitError(
				`Session '${normalized}' not found. Use 'sandctl list' to see available sessions.`,
				4,
			);
		}
		throw error;
	});

	if (!session.provider_id) {
		if (!options.force) {
			throw new Error(
				`Session '${session.id}' is in legacy format. Re-run with --force to remove local state only.`,
			);
		}
		await store.remove(session.id);
		if (!options.silent) {
			console.log(`Session '${session.id}' destroyed.`);
		}
		return { id: session.id, destroyed: true };
	}

	if (!options.force) {
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

	let deleteError: unknown;
	let deletionAttempted = false;

	try {
		const config = await dependencies.loadConfig(configPath);
		const providerConfig = getProviderConfig(config, session.provider);
		if (providerConfig) {
			const provider = dependencies.resolveProvider(
				session.provider,
				providerConfig,
			);
			await provider.delete(session.provider_id);
			deletionAttempted = true;
		}
	} catch (error) {
		deleteError = error;
	}

	if (!deletionAttempted) {
		const legacyProvider = dependencies.resolveLegacyProvider(session.provider);
		if (legacyProvider) {
			try {
				await legacyProvider.deleteVM(session.provider_id);
				deletionAttempted = true;
			} catch (error) {
				deleteError = error;
			}
		}
	}

	if (!deletionAttempted) {
		const details = deleteError
			? deleteError instanceof Error
				? deleteError.message
				: String(deleteError)
			: `provider '${session.provider}' is not configured`;
		console.warn(
			`[warn] Failed to delete provider VM '${session.provider_id}': ${details}`,
		);
		throw new Error(
			`Failed to delete provider VM '${session.provider_id}': ${details}`,
		);
	}

	await store.remove(session.id);
	if (!options.silent) {
		console.log(`Session '${session.id}' destroyed.`);
	}
	return { id: session.id, destroyed: true };
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
