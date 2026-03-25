import { confirm } from "@inquirer/prompts";
import { Command } from "commander";
import { createSpinner } from "nanospinner";

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
import type { HetznerProvider } from "@/hetzner/provider";
import { get as getProviderFromRegistry } from "@/provider/registry";
import { SessionStore } from "@/session/store";

interface ResizeSpinner {
	succeed(message: string): void;
	fail(message: string): void;
	update(message: string): void;
}

interface Dependencies {
	loadConfig: (configPath?: string) => Promise<Config>;
	resolveProvider: (
		name: string,
		config: ProviderConfig,
	) => ReturnType<typeof getProviderFromRegistry>;
	store: SessionStoreLike & {
		update(id: string, updates: Record<string, unknown>): Promise<void>;
	};
	createSpinner: (text: string) => ResizeSpinner;
}

const noopSpinner: ResizeSpinner = {
	succeed() {},
	fail() {},
	update() {},
};

const defaultDependencies: Dependencies = {
	loadConfig: load,
	resolveProvider: getProviderFromRegistry,
	store: new SessionStore(),
	createSpinner: (text) => {
		const spinner = createSpinner(text).start();
		return {
			succeed(message: string): void {
				spinner.success({ text: message });
			},
			fail(message: string): void {
				spinner.error({ text: message });
			},
			update(message: string): void {
				spinner.update({ text: message });
			},
		};
	},
};

export interface ResizeResult {
	id: string;
	serverType: string;
	resized: boolean;
}

export async function runResize(
	name: string,
	serverType: string,
	options: { force: boolean; upgradeDisk: boolean; silent?: boolean },
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<ResizeResult> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	const session = await lookupSession(name, dependencies.store);

	if (!session.provider_id) {
		throw new Error(
			`Session '${session.id}' is in legacy format and cannot be resized.`,
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

	if (!("resize" in provider) || typeof provider.resize !== "function") {
		throw new Error(`Provider '${session.provider}' does not support resize.`);
	}

	if (!options.force) {
		let message = `Resize session '${session.id}' to ${serverType}?`;
		if (options.upgradeDisk) {
			console.warn(
				`Warning: --upgrade-disk will expand the disk to match ${serverType}. This prevents future downgrades.`,
			);
			message = `Resize session '${session.id}' to ${serverType} (with disk upgrade)?`;
		}

		const accepted = await confirm({ message, default: false });
		if (!accepted) {
			if (!options.silent) {
				console.log("Canceled.");
			}
			return { id: session.id, serverType, resized: false };
		}
	}

	const spinner = options.silent
		? noopSpinner
		: dependencies.createSpinner(
				`Powering off session '${session.id}'...`,
			);

	try {
		await (provider as HetznerProvider).resize(
			session.provider_id,
			serverType,
			options.upgradeDisk,
			(step: string) => {
				spinner.update(step);
			},
		);

		await dependencies.store.update(session.id, { server_type: serverType });

		spinner.succeed(`Session '${session.id}' resized to ${serverType}.`);
	} catch (error) {
		spinner.fail(`Failed to resize session '${session.id}'.`);
		throw error;
	}

	return { id: session.id, serverType, resized: true };
}

export function registerResizeCommand(): Command {
	return new Command("resize")
		.description("Resize a session's server type (CPU/RAM)")
		.argument("<name>", "Session name")
		.argument("<server-type>", "Target server type (e.g., cpx41)")
		.option("-f, --force", "Skip confirmation prompt", false)
		.option(
			"--upgrade-disk",
			"Expand disk to match new server type (prevents downgrades)",
			false,
		)
		.action(
			async (
				name: string,
				serverType: string,
				options: { force: boolean; upgradeDisk: boolean },
				command: Command,
			) => {
				const globals = command.optsWithGlobals() as {
					config?: string;
					json?: boolean;
				};
				if (globals.json) {
					options.force = true;
				}
				const result = await runResize(
					name,
					serverType,
					{ ...options, silent: globals.json },
					undefined,
					globals.config,
				);
				if (globals.json) {
					console.log(JSON.stringify(result, null, 2));
				}
			},
		);
}
