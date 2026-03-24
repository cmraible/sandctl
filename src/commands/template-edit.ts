import { Command } from "commander";
import { ValidationError } from "@/core/errors";
import { getTemplateScriptPath } from "@/core/templates";
import { TemplateStore } from "@/template/store";
import { openInEditor } from "@/utils/editor";

interface Dependencies {
	openEditor: (filePath: string) => Promise<void>;
}

const defaultDependencies: Dependencies = {
	openEditor: openInEditor,
};

export async function runTemplateEdit(
	name: string,
	store = new TemplateStore(),
	deps: Partial<Dependencies> = {},
): Promise<void> {
	const { openEditor: edit } = { ...defaultDependencies, ...deps };

	let scriptPath: string;
	try {
		scriptPath = await getTemplateScriptPath(name, store);
	} catch (error) {
		if (error instanceof ValidationError) {
			throw new Error(error.message);
		}
		throw error;
	}

	await edit(scriptPath);
}

export function registerTemplateEditCommand(): Command {
	return new Command("edit")
		.description("Edit a template's init script")
		.argument("<name>", "Template name")
		.action(async (name: string) => {
			await runTemplateEdit(name);
		});
}
