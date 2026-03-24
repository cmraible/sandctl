import { Command } from "commander";

import {
	lookupSession,
	type SessionStoreLike,
} from "@/commands/shared/session-runtime";
import {
	type Config,
	getProviderConfig,
	load,
	type ProviderConfig,
} from "@/config/config";
import { get as getProviderFromRegistry } from "@/provider/registry";
import { SessionStore } from "@/session/store";

interface Dependencies {
	loadConfig: (configPath?: string) => Promise<Config>;
	resolveProvider: (
		name: string,
		config: ProviderConfig,
	) => ReturnType<typeof getProviderFromRegistry>;
	store: SessionStoreLike;
}

const defaultDependencies: Dependencies = {
	loadConfig: load,
	resolveProvider: getProviderFromRegistry,
	store: new SessionStore(),
};

export interface RebootResult {
	id: string;
	rebooted: boolean;
}

export async function runReboot(
	name: string,
	options: { silent?: boolean },
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<RebootResult> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	const session = await lookupSession(name, dependencies.store);

	if (!session.provider_id) {
		throw new Error(
			`Session '${session.id}' is in legacy format and cannot be rebooted.`,
		);
	}

	const config = await dependencies.loadConfig(configPath);
	const providerConfig = getProviderConfig(config, session.provider);
	if (!providerConfig) {
		throw new Error(
			`Provider '${session.provider}' is not configured. Check your sandctl config.`,
		);
	}

	const provider = dependencies.resolveProvider(
		session.provider,
		providerConfig,
	);
	await provider.reboot(session.provider_id);

	if (!options.silent) {
		console.log(`Session '${session.id}' is rebooting.`);
	}

	return { id: session.id, rebooted: true };
}

export function registerRebootCommand(): Command {
	return new Command("reboot")
		.description("Reboot a session's VM")
		.argument("<name>")
		.action(async (name: string, _options: unknown, command: Command) => {
			const globals = command.optsWithGlobals() as {
				config?: string;
				json?: boolean;
			};
			const result = await runReboot(
				name,
				{ silent: globals.json },
				undefined,
				globals.config,
			);
			if (globals.json) {
				console.log(JSON.stringify(result, null, 2));
			}
		});
}
