import { Command } from "commander";

import { TemplateAlreadyExistsError, TemplateStore } from "@/template/store";
import type { TemplateConfig } from "@/template/types";
import { openInEditor } from "@/utils/editor";

interface Dependencies {
	log: (message: string) => void;
	errLog: (message: string) => void;
	openEditor: (filePath: string) => Promise<void>;
}

const defaultDependencies: Dependencies = {
	log: (message: string) => console.log(message),
	errLog: (message: string) => console.error(message),
	openEditor: openInEditor,
};

export async function runTemplateAdd(
	name: string,
	options: { json?: boolean } = {},
	store = new TemplateStore(),
	deps: Partial<Dependencies> = {},
): Promise<void> {
	const { log, errLog, openEditor: edit } = { ...defaultDependencies, ...deps };

	if (!name.trim()) {
		throw new Error("template name is required");
	}

	let config: TemplateConfig;
	try {
		config = await store.add(name);
	} catch (error) {
		if (error instanceof TemplateAlreadyExistsError) {
			errLog(
				`Error: Template '${name}' already exists. Use 'sandctl template edit ${name}' to modify it.`,
			);
			return;
		}
		throw error;
	}

	if (options.json) {
		console.log(JSON.stringify(config, null, 2));
		return;
	}

	const scriptPath = await store.getInitScriptPath(name);
	log(`Created template '${config.original_name}'`);
	log("Opening init script in editor...");

	try {
		await edit(scriptPath);
	} catch (error) {
		errLog(
			`Warning: ${error instanceof Error ? error.message : String(error)}`,
		);
		errLog(`Edit your script at: ${scriptPath}`);
	}

	log("");
	log(
		`Template '${config.original_name}' is ready. Use 'sandctl new -T ${config.template}' to create a session.`,
	);
}

export function registerTemplateAddCommand(): Command {
	return new Command("add")
		.description("Create a new template configuration")
		.argument("<name>", "Template name")
		.action(async (name: string, _options: unknown, command: Command) => {
			const globals = command.optsWithGlobals() as { json?: boolean };
			await runTemplateAdd(name, { json: globals.json });
		});
}
