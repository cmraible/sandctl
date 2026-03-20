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
import {
	age,
	Duration,
	isActive,
	type Session,
	timeoutRemaining,
} from "@/session/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReapResult {
	id: string;
	provider: string;
	age: string;
	timeout: string;
	past_expiry: string;
	destroyed: boolean;
	error?: string;
}

interface Dependencies {
	loadConfig: (configPath?: string) => Promise<Config>;
	resolveProvider: (
		name: string,
		config: ProviderConfig,
	) => ReturnType<typeof getProviderFromRegistry>;
	resolveLegacyProvider: typeof getProvider;
	store: SessionStore;
	log: (message: string) => void;
	warn: (message: string) => void;
}

const defaultDependencies: Dependencies = {
	loadConfig: load,
	resolveProvider: getProviderFromRegistry,
	resolveLegacyProvider: getProvider,
	store: new SessionStore(),
	log: (message: string) => {
		console.log(message);
	},
	warn: (message: string) => {
		console.warn(message);
	},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		const remainingHours = hours % 24;
		return remainingHours > 0 ? `${days}d${remainingHours}h` : `${days}d`;
	}
	if (hours > 0) {
		const remainingMinutes = minutes % 60;
		return remainingMinutes > 0 ? `${hours}h${remainingMinutes}m` : `${hours}h`;
	}
	if (minutes > 0) {
		return `${minutes}m`;
	}
	return `${seconds}s`;
}

function findExpiredSessions(sessions: Session[]): Session[] {
	return sessions.filter((session) => {
		if (!isActive(session)) {
			return false;
		}
		if (!session.timeout) {
			return false;
		}
		const remaining = timeoutRemaining(session);
		return remaining !== null && remaining <= 0;
	});
}

async function destroySession(
	session: Session,
	deps: Dependencies,
	configPath?: string,
): Promise<void> {
	if (!session.provider_id) {
		await deps.store.remove(session.id);
		return;
	}

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

	await deps.store.remove(session.id);
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export async function runReap(
	options: { dryRun: boolean },
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<ReapResult[]> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	const sessions = await dependencies.store.listActive();
	const expired = findExpiredSessions(sessions);

	if (expired.length === 0) {
		dependencies.log("No expired sessions found.");
		return [];
	}

	const results: ReapResult[] = [];

	for (const session of expired) {
		const sessionAge = age(session);
		const timeoutMs = Duration.parse(session.timeout as string).milliseconds;
		const pastExpiry = sessionAge - timeoutMs;

		const result: ReapResult = {
			id: session.id,
			provider: session.provider,
			age: formatDuration(sessionAge),
			timeout: session.timeout as string,
			past_expiry: formatDuration(pastExpiry),
			destroyed: false,
		};

		if (options.dryRun) {
			dependencies.log(
				`[dry-run] Would reap '${session.id}' (age: ${result.age}, timeout: ${result.timeout}, expired ${result.past_expiry} ago)`,
			);
			results.push(result);
			continue;
		}

		try {
			await destroySession(session, dependencies, configPath);
			result.destroyed = true;
			dependencies.log(
				`Reaped '${session.id}' (age: ${result.age}, timeout: ${result.timeout}, expired ${result.past_expiry} ago)`,
			);
		} catch (error) {
			result.error = error instanceof Error ? error.message : String(error);
			dependencies.warn(
				`[warn] Failed to reap '${session.id}': ${result.error}`,
			);
		}

		results.push(result);
	}

	return results;
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerReapCommand(): Command {
	return new Command("reap")
		.description("Destroy sessions with expired timeouts")
		.option(
			"-n, --dry-run",
			"Preview what would be reaped without destroying",
			false,
		)
		.action(async (options: { dryRun: boolean }, command) => {
			const globals = command.optsWithGlobals() as {
				config?: string;
				json?: boolean;
			};
			const results = await runReap(options, undefined, globals.config);
			if (globals.json) {
				console.log(JSON.stringify(results, null, 2));
			}
		});
}
