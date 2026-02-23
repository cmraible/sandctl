import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { normalizeTemplateName } from "@/template/normalize";
import type { TemplateInitScript, TemplateStoreLike } from "@/template/types";

const INIT_SCRIPT_NAME = "init.sh";

export function defaultTemplatesPath(): string {
	return join(homedir(), ".sandctl", "templates");
}

export class TemplateNotFoundError extends Error {
	constructor(readonly template: string) {
		super(`template '${template}' not found`);
	}
}

export class TemplateStore implements TemplateStoreLike {
	constructor(private readonly basePath = defaultTemplatesPath()) {}

	async getInitScript(name: string): Promise<TemplateInitScript> {
		const normalized = normalizeTemplateName(name);
		if (!normalized) {
			throw new TemplateNotFoundError(name);
		}
		const scriptPath = join(this.basePath, normalized, INIT_SCRIPT_NAME);

		try {
			const script = await readFile(scriptPath, "utf8");
			return {
				name,
				normalized,
				script,
			};
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				throw new TemplateNotFoundError(name);
			}
			throw error;
		}
	}
}
