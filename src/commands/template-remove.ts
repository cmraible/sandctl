import { confirm as inquirerConfirm } from "@inquirer/prompts";
import { Command } from "commander";

import { TemplateNotFoundError, TemplateStore } from "@/template/store";

interface Dependencies {
	log: (message: string) => void;
	confirm: (message: string) => Promise<boolean>;
}

const defaultDependencies: Dependencies = {
	log: (message: string) => console.log(message),
	confirm: (message: string) => inquirerConfirm({ message, default: false }),
};

export async function runTemplateRemove(
	name: string,
	options: { force: boolean; json?: boolean },
	store = new TemplateStore(),
	deps: Partial<Dependencies> = {},
): Promise<void> {
	const { log, confirm: askConfirm } = { ...defaultDependencies, ...deps };

	if (!options.force && !options.json) {
		const accepted = await askConfirm(`Delete template '${name}'?`);
		if (!accepted) {
			log("Canceled.");
			return;
		}
	}

	try {
		await store.remove(name);
	} catch (error) {
		if (error instanceof TemplateNotFoundError) {
			throw new Error(
				`template '${name}' not found. Use 'sandctl template list' to see available templates`,
			);
		}
		throw error;
	}

	if (options.json) {
		console.log(JSON.stringify({ name, removed: true }, null, 2));
		return;
	}

	log(`Template '${name}' deleted.`);
}

export function registerTemplateRemoveCommand(): Command {
	return new Command("remove")
		.description("Delete a template")
		.argument("<name>", "Template name")
		.option("-f, --force", "Skip confirmation prompt", false)
		.action(
			async (name: string, options: { force: boolean }, command: Command) => {
				const globals = command.optsWithGlobals() as { json?: boolean };
				await runTemplateRemove(name, { ...options, json: globals.json });
			},
		);
}
