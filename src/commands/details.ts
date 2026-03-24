import { Command } from "commander";

import {
	getSessionDetails,
	type DetailsResult,
} from "@/core/config";
import { formatCreatedAt } from "@/core/sessions";
import { mapDomainError } from "@/commands/shared/session-runtime";
import type { SessionStoreReader } from "@/core/types";
import { type Config, getProviderConfig, load } from "@/config/config";
import type { Provider } from "@/provider/interface";
import { get as getProviderFromRegistry } from "@/provider/registry";
import { SessionStore } from "@/session/store";

export type { DetailsResult };

interface Dependencies {
	store: SessionStoreReader;
	loadConfig: (configPath?: string) => Promise<Config>;
	getProvider: (name: string, config: Config) => Provider;
	log: (message: string) => void;
}

function buildProvider(name: string, config: Config): Provider {
	const providerConfig = getProviderConfig(config, name);
	if (!providerConfig) {
		throw new Error(`provider '${name}' is not configured`);
	}
	return getProviderFromRegistry(name, providerConfig);
}

const defaultDependencies: Dependencies = {
	store: new SessionStore(),
	loadConfig: load,
	getProvider: buildProvider,
	log: (message: string) => {
		console.log(message);
	},
};

export async function runDetails(
	name: string,
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<DetailsResult> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	try {
		return await getSessionDetails(
			name,
			{
				store: dependencies.store,
				loadConfig: dependencies.loadConfig,
				getProvider: dependencies.getProvider,
			},
			configPath,
		);
	} catch (error) {
		mapDomainError(error);
	}
}

function outputTable(result: DetailsResult, log: (msg: string) => void): void {
	const rows: Array<[string, string]> = [
		["ID", result.id],
		["Status", result.status],
		["Provider", result.provider],
		["Provider ID", result.provider_id],
		["IP Address", result.ip_address],
		["Region", result.region],
		["Server Type", result.server_type],
		["CPUs", result.cores != null ? String(result.cores) : "-"],
		["Memory", result.memory_gb != null ? `${result.memory_gb} GB` : "-"],
		["Disk", result.disk_gb != null ? `${result.disk_gb} GB` : "-"],
		["CPU Type", result.cpu_type ?? "-"],
		["Created", formatCreatedAt(result.created_at)],
		["Uptime", result.uptime],
		["Timeout", result.timeout ?? "-"],
		["Remaining", result.timeout_remaining],
	];

	if (result.failure_reason) {
		rows.push(["Failure Reason", result.failure_reason]);
	}

	const labelWidth = Math.max(...rows.map(([label]) => label.length)) + 1;
	for (const [label, value] of rows) {
		log(`${`${label}:`.padEnd(labelWidth + 1)} ${value}`);
	}
}

export function registerDetailsCommand(): Command {
	return new Command("details")
		.description("Show detailed VM information including hardware specs")
		.argument("<name>")
		.action(async (name: string, _options: unknown, command: Command) => {
			const globals = command.optsWithGlobals() as {
				config?: string;
				json?: boolean;
			};
			const result = await runDetails(name, {}, globals.config);
			if (globals.json) {
				console.log(JSON.stringify(result, null, 2));
				return;
			}
			outputTable(result, console.log);
		});
}
