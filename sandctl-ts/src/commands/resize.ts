import { confirm } from "@inquirer/prompts";
import { Command } from "commander";

import {
	type Config,
	getProviderConfig,
	load,
	type ProviderConfig,
} from "@/config/config";
import type { HetznerProvider } from "@/hetzner/provider";
import { get as getProviderFromRegistry } from "@/provider/registry";
import { normalizeName, validateID } from "@/session/id";
import { SessionStore } from "@/session/store";
import { NotFoundError } from "@/session/types";

import { CommandExitError } from "@/commands/destroy";

interface Dependencies {
	loadConfig: (configPath?: string) => Promise<Config>;
	resolveProvider: (
		name: string,
		config: ProviderConfig,
	) => ReturnType<typeof getProviderFromRegistry>;
}

const defaultDependencies: Dependencies = {
	loadConfig: load,
	resolveProvider: getProviderFromRegistry,
};

export async function runResize(
	name: string,
	serverType: string,
	options: { force: boolean; upgradeDisk: boolean },
	store = new SessionStore(),
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<void> {
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
		throw new Error(
			`Session '${session.id}' is in legacy format and cannot be resized.`,
		);
	}

	const config = await dependencies.loadConfig(configPath);
	const providerConfig = getProviderConfig(config, session.provider);
	if (!providerConfig) {
		throw new Error(`Provider '${session.provider}' is not configured.`);
	}

	const provider = dependencies.resolveProvider(
		session.provider,
		providerConfig,
	);

	// Check provider supports resize
	if (!("resize" in provider) || typeof provider.resize !== "function") {
		throw new Error(
			`Provider '${session.provider}' does not support resize.`,
		);
	}

	// Confirm unless --force
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
			console.log("Canceled.");
			return;
		}
	}

	console.log(
		`Resizing session '${session.id}' to ${serverType}...`,
	);

	await (provider as HetznerProvider).resize(
		session.provider_id,
		serverType,
		options.upgradeDisk,
	);

	// Update session store with new server type
	await store.update(session.id, { server_type: serverType });

	console.log(
		`Session '${session.id}' resized to ${serverType}.`,
	);
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
				command,
			) => {
				const globals = command.optsWithGlobals() as { config?: string };
				await runResize(
					name,
					serverType,
					options,
					undefined,
					undefined,
					globals.config,
				);
			},
		);
}
