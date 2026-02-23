import { Command } from "commander";
import { DateTime } from "luxon";

import {
	type Config,
	getProviderConfig,
	load,
	type ProviderConfig,
} from "@/config/config";
import type { VMStatus } from "@/provider";
import { get as getProviderFromRegistry } from "@/provider/registry";
import type { VM } from "@/provider/types";
import { SessionStore } from "@/session/store";
import { type Session, type Status, timeoutRemaining } from "@/session/types";

function assertNever(value: never): never {
	throw new Error(`unknown VM status: ${String(value)}`);
}

function mapVMStatusToSession(status: VMStatus): Status {
	switch (status) {
		case "running":
			return "running";
		case "provisioning":
		case "starting":
			return "provisioning";
		case "stopped":
		case "stopping":
		case "deleting":
			return "stopped";
		case "failed":
			return "failed";
	}
	return assertNever(status);
}

export function formatTimeout(remaining: number | null): string {
	if (remaining === null) {
		return "-";
	}
	if (remaining <= 0) {
		return "expired";
	}
	if (remaining >= 60 * 60 * 1000) {
		const hours = Math.floor(remaining / (60 * 60 * 1000));
		const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
		if (minutes > 0) {
			return `${hours}h${minutes}m remaining`;
		}
		return `${hours}h remaining`;
	}
	return `${Math.floor(remaining / (60 * 1000))}m remaining`;
}

function formatCreatedAt(createdAt: string): string {
	return DateTime.fromISO(createdAt).toLocal().toFormat("yyyy-MM-dd HH:mm:ss");
}

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

async function syncProviderSessions(
	sessions: Session[],
	store: SessionStore,
	deps: Dependencies,
	configPath?: string,
): Promise<void> {
	const providerNames = [
		...new Set(
			sessions
				.filter((session) => session.provider_id)
				.map((session) => session.provider),
		),
	];

	if (providerNames.length === 0) {
		return;
	}

	let config: Config;
	try {
		config = await deps.loadConfig(configPath);
	} catch (error) {
		deps.warn(`Failed to load config for provider sync: ${String(error)}`);
		return;
	}

	for (const providerName of providerNames) {
		const providerConfig = getProviderConfig(config, providerName);
		if (!providerConfig) {
			deps.warn(
				`[warn] Failed to sync provider '${providerName}': provider is not configured`,
			);
			continue;
		}

		const providerSessions = sessions.filter(
			(session) => session.provider === providerName && session.provider_id,
		);

		let providerVMs: VM[];
		try {
			const provider = deps.resolveProvider(providerName, providerConfig);
			providerVMs = await provider.list();
		} catch (error) {
			deps.warn(
				`[warn] Failed to sync provider '${providerName}': ${String(error)}`,
			);
			continue;
		}

		const vmByID = new Map(providerVMs.map((vm) => [vm.id, vm]));

		for (const session of providerSessions) {
			const vm = vmByID.get(session.provider_id);
			if (!vm) {
				if (session.status === "running" || session.status === "provisioning") {
					session.status = "stopped";
					await store.update(session.id, { status: "stopped" });
				}
				continue;
			}

			const nextStatus = mapVMStatusToSession(vm.status);
			const nextIP = vm.ipAddress ?? session.ip_address;
			if (nextStatus !== session.status || nextIP !== session.ip_address) {
				session.status = nextStatus;
				session.ip_address = nextIP;
				await store.update(session.id, {
					status: session.status,
					ip_address: session.ip_address,
				});
			}
		}
	}
}

export async function runList(
	options: { format: string; all: boolean },
	store = new SessionStore(),
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<void> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	let sessions = (
		options.all ? await store.list() : await store.listActive()
	).map((session) => ({ ...session }));

	for (const session of sessions) {
		if (!session.provider_id && session.status !== "stopped") {
			session.status = "stopped";
			await store.update(session.id, { status: "stopped" });
		}
	}

	await syncProviderSessions(sessions, store, dependencies, configPath);

	if (!options.all) {
		sessions = sessions.filter(
			(session) =>
				session.status === "provisioning" || session.status === "running",
		);
	}

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
		.action(async (options: { format: string; all: boolean }, command) => {
			const globals = command.optsWithGlobals() as { config?: string };
			await runList(options, undefined, undefined, globals.config);
		});
}
