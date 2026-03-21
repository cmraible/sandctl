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
import { Duration, type Session, timeoutRemaining } from "@/session/types";

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

export interface ReapedSession {
	id: string;
	age: string;
	timeout: string;
	destroyed: boolean;
	error?: string;
}

export interface ReapResult {
	reaped: ReapedSession[];
	errors: number;
}

function formatAge(ms: number): string {
	const d = new Duration(ms);
	return d.toString();
}

function isExpired(session: Session): boolean {
	if (!session.timeout) {
		return false;
	}
	const remaining = timeoutRemaining(session);
	return remaining !== null && remaining <= 0;
}

async function destroySession(
	session: Session,
	store: SessionStore,
	deps: Dependencies,
	configPath?: string,
): Promise<void> {
	let deletionAttempted = false;
	let deleteError: unknown;

	try {
		const config = await deps.loadConfig(configPath);
		const providerConfig = getProviderConfig(config, session.provider);
		if (providerConfig) {
			const provider = deps.resolveProvider(session.provider, providerConfig);
			await provider.delete(session.provider_id);
			deletionAttempted = true;
		}
	} catch (error) {
		deleteError = error;
	}

	if (!deletionAttempted) {
		const legacyProvider = deps.resolveLegacyProvider(session.provider);
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
		throw new Error(
			`Failed to delete provider VM '${session.provider_id}': ${details}`,
		);
	}

	await store.remove(session.id);
}

export async function runReap(
	options: { dryRun: boolean; silent?: boolean },
	store = new SessionStore(),
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<ReapResult> {
	const dependencies = { ...defaultDependencies, ...deps };

	const sessions = await store.listActive();
	const expired = sessions.filter(isExpired);

	if (expired.length === 0) {
		if (!options.silent) {
			console.log("No expired sessions found.");
		}
		return { reaped: [], errors: 0 };
	}

	if (options.dryRun) {
		if (!options.silent) {
			console.log("Expired sessions (dry run):");
			for (const session of expired) {
				const ageMs = Date.now() - new Date(session.created_at).getTime();
				console.log(
					`  ${session.id}  age=${formatAge(ageMs)}  timeout=${session.timeout}`,
				);
			}
		}
		return {
			reaped: expired.map((s) => ({
				id: s.id,
				age: formatAge(Date.now() - new Date(s.created_at).getTime()),
				timeout: s.timeout as string,
				destroyed: false,
			})),
			errors: 0,
		};
	}

	const result: ReapResult = { reaped: [], errors: 0 };

	for (const session of expired) {
		const ageMs = Date.now() - new Date(session.created_at).getTime();
		const entry: ReapedSession = {
			id: session.id,
			age: formatAge(ageMs),
			timeout: session.timeout as string,
			destroyed: false,
		};

		try {
			await destroySession(session, store, dependencies, configPath);
			entry.destroyed = true;
			if (!options.silent) {
				console.log(
					`Reaped session '${session.id}' (age=${entry.age}, timeout=${entry.timeout})`,
				);
			}
		} catch (error) {
			entry.error = error instanceof Error ? error.message : String(error);
			result.errors++;
			if (!options.silent) {
				console.warn(
					`[warn] Failed to reap session '${session.id}': ${entry.error}`,
				);
			}
		}

		result.reaped.push(entry);
	}

	return result;
}

export function registerReapCommand(): Command {
	return new Command("reap")
		.description("Destroy all expired sessions (sessions past their timeout)")
		.option(
			"-n, --dry-run",
			"Preview expired sessions without destroying",
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
			if (result.errors > 0) {
				process.exitCode = 1;
			}
		});
}
