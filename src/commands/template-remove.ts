import { confirm as inquirerConfirm } from "@inquirer/prompts";
import { Command } from "commander";

import { removeTemplate } from "@/core/templates";
import { ValidationError } from "@/core/errors";
import { TemplateStore } from "@/template/store";
import type { TemplateStoreLike } from "@/template/types";

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
	store: TemplateStoreLike = new TemplateStore(),
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
		await removeTemplate(name, store);
	} catch (error) {
		if (error instanceof ValidationError) {
			throw new Error(error.message);
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
