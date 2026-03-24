import { Command } from "commander";
import { ValidationError } from "@/core/errors";
import { addTemplate } from "@/core/templates";
import { TemplateStore } from "@/template/store";
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
	const {
		log,
		errLog,
		openEditor: edit,
	} = {
		...defaultDependencies,
		...deps,
	};

	let result: Awaited<ReturnType<typeof addTemplate>>;
	try {
		result = await addTemplate(name, store);
	} catch (error) {
		if (error instanceof ValidationError) {
			if (error.message.includes("already exists")) {
				errLog(`Error: ${error.message}`);
				return;
			}
			throw new Error(error.message);
		}
		throw error;
	}

	if (options.json) {
		console.log(JSON.stringify(result.config, null, 2));
		return;
	}

	log(`Created template '${result.config.original_name}'`);
	log("Opening init script in editor...");

	try {
		await edit(result.scriptPath);
	} catch (error) {
		errLog(
			`Warning: ${error instanceof Error ? error.message : String(error)}`,
		);
		errLog(`Edit your script at: ${result.scriptPath}`);
	}

	log("");
	log(
		`Template '${result.config.original_name}' is ready. Use 'sandctl new -T ${result.config.template}' to create a session.`,
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
