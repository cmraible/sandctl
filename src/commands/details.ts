import { Command } from "commander";
import { DateTime } from "luxon";
import { formatTimeout } from "@/commands/list";
import {
	lookupSession,
	type SessionStoreLike,
} from "@/commands/shared/session-runtime";
import { type Config, getProviderConfig, load } from "@/config/config";
import type { Provider } from "@/provider/interface";
import { get as getProviderFromRegistry } from "@/provider/registry";
import type { VM } from "@/provider/types";
import { SessionStore } from "@/session/store";
import { age, type Session, timeoutRemaining } from "@/session/types";

interface Dependencies {
	store: SessionStoreLike;
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

function formatAge(ms: number): string {
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

function formatCreatedAt(createdAt: string): string {
	return DateTime.fromISO(createdAt).toLocal().toFormat("yyyy-MM-dd HH:mm:ss");
}

export interface DetailsResult {
	id: string;
	status: string;
	provider: string;
	provider_id: string;
	ip_address: string;
	region: string;
	server_type: string;
	cores: number | null;
	memory_gb: number | null;
	disk_gb: number | null;
	cpu_type: string | null;
	created_at: string;
	uptime: string;
	timeout: string | null;
	timeout_remaining: string;
	failure_reason: string | null;
}

function buildResult(session: Session, vm: VM | null): DetailsResult {
	const remaining = timeoutRemaining(session);
	return {
		id: session.id,
		status: vm?.status ?? session.status,
		provider: session.provider,
		provider_id: session.provider_id,
		ip_address: vm?.ipAddress ?? (session.ip_address || "-"),
		region: vm?.region ?? session.region ?? "-",
		server_type: vm?.serverType ?? session.server_type ?? "-",
		cores: vm?.cores ?? null,
		memory_gb: vm?.memoryGB ?? null,
		disk_gb: vm?.diskGB ?? null,
		cpu_type: vm?.cpuType ?? null,
		created_at: session.created_at,
		uptime: formatAge(age(session)),
		timeout: session.timeout ?? null,
		timeout_remaining: formatTimeout(remaining),
		failure_reason: session.failure_reason ?? null,
	};
}

export async function runDetails(
	name: string,
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<DetailsResult> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	const session = await lookupSession(name, dependencies.store);

	let vm: VM | null = null;
	if (session.provider_id) {
		const config = await dependencies.loadConfig(configPath);
		const provider = dependencies.getProvider(session.provider, config);
		vm = await provider.get(session.provider_id);
	}

	return buildResult(session, vm);
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
