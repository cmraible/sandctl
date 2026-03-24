import { Command } from "commander";

import {
	listSessions,
	formatTimeout,
	formatCreatedAt,
} from "@/core/sessions";
import {
	type Config,
	load,
	type ProviderConfig,
} from "@/config/config";
import { get as getProviderFromRegistry } from "@/provider/registry";
import { SessionStore } from "@/session/store";
import { type Session, timeoutRemaining } from "@/session/types";

export { formatTimeout };

function outputTable(sessions: Session[]): void {
	console.log("ID       PROVIDER  STATUS   CREATED              TIMEOUT");
	for (const session of sessions) {
		const providerName = session.provider_id ? session.provider : "(legacy)";
		const cols = [
			session.id.padEnd(8),
			providerName.padEnd(9),
			session.status.padEnd(8),
			formatCreatedAt(session.created_at).padEnd(20),
			formatTimeout(timeoutRemaining(session)),
		];
		console.log(cols.join(" "));
	}
}

interface Dependencies {
	loadConfig: (configPath?: string) => Promise<Config>;
	resolveProvider: (
		name: string,
		config: ProviderConfig,
	) => ReturnType<typeof getProviderFromRegistry>;
	warn: (message: string) => void;
}

const defaultDependencies: Dependencies = {
	loadConfig: load,
	resolveProvider: getProviderFromRegistry,
	warn: (message: string) => {
		console.warn(message);
	},
};

export async function runList(
	options: { format: string; all: boolean; sync?: boolean },
	store = new SessionStore(),
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<void> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	const sessions = await listSessions(
		{ all: options.all, sync: options.sync },
		{
			store,
			loadConfig: (path) => dependencies.loadConfig(path ?? configPath),
			resolveProvider: dependencies.resolveProvider,
			warn: dependencies.warn,
		},
		configPath,
	);

	if (sessions.length === 0) {
		if (options.format === "json") {
			console.log("[]");
			return;
		}
		console.log("No active sessions.");
		console.log("Use 'sandctl new' to create one.");
		return;
	}

	if (options.format === "json") {
		console.log(JSON.stringify(sessions, null, 2));
		return;
	}
	if (options.format === "table") {
		outputTable(sessions);
		return;
	}
	throw new Error(`unknown format: ${options.format} (valid: table, json)`);
}

export function registerListCommand(): Command {
	return new Command("list")
		.alias("ls")
		.description("List active sessions")
		.option(
			"-f, --format <format>",
			"Output format: table (default) or json",
			"table",
		)
		.option("-a, --all", "Include stopped and failed sessions", false)
		.option(
			"--sync",
			"Sync session status with the cloud provider (slower)",
			false,
		)
		.action(
			async (
				options: { format: string; all: boolean; sync: boolean },
				command,
			) => {
				const globals = command.optsWithGlobals() as {
					config?: string;
					json?: boolean;
				};
				if (globals.json) {
					options.format = "json";
				}
				await runList(options, undefined, undefined, globals.config);
			},
		);
}
