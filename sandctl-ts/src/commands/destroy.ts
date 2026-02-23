import { confirm } from "@inquirer/prompts";
import { Command } from "commander";

import { getProvider } from "@/provider";
import { normalizeName, validateID } from "@/session/id";
import { SessionStore } from "@/session/store";
import { NotFoundError } from "@/session/types";

export class CommandExitError extends Error {
	constructor(
		message: string,
		readonly exitCode: number,
	) {
		super(message);
	}
}

export async function runDestroy(
	name: string,
	options: { force: boolean },
	store = new SessionStore(),
): Promise<void> {
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
		if (!options.force) {
			throw new Error(
				`Session '${session.id}' is in legacy format. Re-run with --force to remove local state only.`,
			);
		}
		await store.remove(session.id);
		console.log(`Session '${session.id}' destroyed.`);
		return;
	}

	if (!options.force) {
		const accepted = await confirm({
			message: `Destroy session '${session.id}'? This cannot be undone.`,
			default: false,
		});
		if (!accepted) {
			console.log("Canceled.");
			return;
		}
	}

	const provider = getProvider(session.provider);
	if (provider) {
		try {
			await provider.deleteVM(session.provider_id);
		} catch (error) {
			const details = error instanceof Error ? error.message : String(error);
			console.warn(
				`[warn] Failed to delete provider VM '${session.provider_id}': ${error}`,
			);
			throw new Error(
				`Failed to delete provider VM '${session.provider_id}': ${details}`,
			);
		}
	}

	await store.remove(session.id);
	console.log(`Session '${session.id}' destroyed.`);
}

export function registerDestroyCommand(): Command {
	return new Command("destroy")
		.aliases(["rm", "delete"])
		.description("Terminate and remove a session")
		.argument("<name>")
		.option("-f, --force", "Skip confirmation prompt", false)
		.action(async (name: string, options: { force: boolean }) => {
			await runDestroy(name, options);
		});
}
