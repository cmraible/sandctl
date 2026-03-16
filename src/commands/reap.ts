import { Command } from "commander";

import {
	type Config,
	getProviderConfig,
	load,
	type ProviderConfig,
} from "@/config/config";
import { getProvider } from "@/provider";
import { get as getProviderFromRegistry } from "@/provider/registry";
import { SessionStore } from "@/session/store";
import { type Session, timeoutRemaining } from "@/session/types";

interface Dependencies {
	loadConfig: (configPath?: string) => Promise<Config>;
	resolveProvider: (
		name: string,
		config: ProviderConfig,
	) => ReturnType<typeof getProviderFromRegistry>;
	resolveLegacyProvider: typeof getProvider;
	warn: (message: string) => void;
}

const defaultDependencies: Dependencies = {
	loadConfig: load,
	resolveProvider: getProviderFromRegistry,
	resolveLegacyProvider: getProvider,
	warn: (message: string) => {
		console.warn(message);
	},
};

export interface ReapResult {
	reaped: { id: string; provider_id: string }[];
	failed: { id: string; provider_id: string; error: string }[];
	dry_run: boolean;
}

export async function runReap(
	options: { dryRun: boolean; silent?: boolean },
	store = new SessionStore(),
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<ReapResult> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	const result: ReapResult = {
		reaped: [],
		failed: [],
		dry_run: options.dryRun,
	};

	const sessions = await store.listActive();

	const expired = sessions.filter((session) => {
		const remaining = timeoutRemaining(session);
		return remaining !== null && remaining === 0;
	});

	if (expired.length === 0) {
		if (!options.silent) {
			console.log("No expired sessions found.");
		}
		return result;
	}

	if (options.dryRun) {
		for (const session of expired) {
			result.reaped.push({
				id: session.id,
				provider_id: session.provider_id,
			});
			if (!options.silent) {
				console.log(`Would reap session '${session.id}'`);
			}
		}
		return result;
	}

	let config: Config | undefined;
	try {
		config = await dependencies.loadConfig(configPath);
	} catch (error) {
		dependencies.warn(
			`Failed to load config: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	for (const session of expired) {
		try {
			await deleteSessionVM(session, config, dependencies);
			await store.remove(session.id);
			result.reaped.push({
				id: session.id,
				provider_id: session.provider_id,
			});
			if (!options.silent) {
				console.log(`Reaped session '${session.id}'`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			result.failed.push({
				id: session.id,
				provider_id: session.provider_id,
				error: message,
			});
			if (!options.silent) {
				dependencies.warn(
					`[warn] Failed to reap session '${session.id}': ${message}`,
				);
			}
		}
	}

	return result;
}

async function deleteSessionVM(
	session: Session,
	config: Config | undefined,
	deps: Dependencies,
): Promise<void> {
	if (!session.provider_id) {
		throw new Error("session has no provider_id");
	}

	let deleteError: unknown;

	if (config) {
		const providerConfig = getProviderConfig(config, session.provider);
		if (providerConfig) {
			try {
				const provider = deps.resolveProvider(session.provider, providerConfig);
				await provider.delete(session.provider_id);
				return;
			} catch (error) {
				deleteError = error;
			}
		}
	}

	const legacyProvider = deps.resolveLegacyProvider(session.provider);
	if (legacyProvider) {
		try {
			await legacyProvider.deleteVM(session.provider_id);
			return;
		} catch (error) {
			deleteError = error;
		}
	}

	const details = deleteError
		? deleteError instanceof Error
			? deleteError.message
			: String(deleteError)
		: `provider '${session.provider}' is not configured`;
	throw new Error(
		`Failed to delete provider VM '${session.provider_id}': ${details}`,
	);
}

export function registerReapCommand(): Command {
	return new Command("reap")
		.description("Destroy all sessions with expired timeouts")
		.option(
			"-n, --dry-run",
			"Show what would be reaped without destroying",
			false,
		)
		.action(async (options: { dryRun: boolean }, command) => {
			const globals = command.optsWithGlobals() as {
				config?: string;
				json?: boolean;
			};
			const result = await runReap(
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
