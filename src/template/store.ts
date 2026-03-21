import {
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import YAML from "yaml";

import { normalizeTemplateName } from "@/template/normalize";
import type {
	TemplateConfig,
	TemplateInitScript,
	TemplateStoreLike,
} from "@/template/types";

const INIT_FILE_NAME = "init";
const INIT_SCRIPT_NAME_LEGACY = "init.sh";
const CONFIG_NAME = "config.yaml";

function parseAndValidateConfig(data: string, source: string): TemplateConfig {
	const parsed = YAML.parse(data);
	if (
		!parsed ||
		typeof parsed !== "object" ||
		typeof parsed.template !== "string" ||
		typeof parsed.original_name !== "string" ||
		typeof parsed.created_at !== "string"
	) {
		throw new Error(
			`invalid template config at ${source}: missing required fields (template, original_name, created_at)`,
		);
	}
	return parsed as TemplateConfig;
}

function assertNoPathTraversal(name: string): void {
	if (name.includes("..") || name.includes("/") || name.includes("\\")) {
		throw new Error(
			`invalid template name '${name}': path traversal sequences are not allowed`,
		);
	}
}

export function defaultTemplatesPath(): string {
	return join(homedir(), ".sandctl", "templates");
}

export class TemplateNotFoundError extends Error {
	constructor(readonly template: string) {
		super(`template '${template}' not found`);
	}
}

export class TemplateAlreadyExistsError extends Error {
	constructor(readonly template: string) {
		super(`template '${template}' already exists`);
	}
}

function generateInitScript(originalName: string): string {
	return `#!/bin/bash
# Init script for template: ${originalName}
# This runs as part of cloud-init during VM creation.
#
# Alternatively, use cloud-config format by starting with '#cloud-config':
#   #cloud-config
#   packages:
#     - nodejs
#     - npm

set -e  # Exit on first error

echo "Template '${originalName}' initialized successfully"
`;
}

export class TemplateStore implements TemplateStoreLike {
	constructor(private readonly basePath = defaultTemplatesPath()) {}

	async add(name: string): Promise<TemplateConfig> {
		assertNoPathTraversal(name);
		const normalized = normalizeTemplateName(name);
		if (!normalized) {
			throw new Error("template name is required");
		}

		const templateDir = join(this.basePath, normalized);
		const configPath = join(templateDir, CONFIG_NAME);

		// Check if already exists
		try {
			await stat(configPath);
			throw new TemplateAlreadyExistsError(name);
		} catch (error) {
			if (error instanceof TemplateAlreadyExistsError) throw error;
			// ENOENT is expected — template doesn't exist yet
		}

		const config: TemplateConfig = {
			template: normalized,
			original_name: name,
			created_at: new Date().toISOString(),
		};

		await mkdir(templateDir, { recursive: true });
		await writeFile(configPath, YAML.stringify(config), { mode: 0o600 });
		await writeFile(
			join(templateDir, INIT_FILE_NAME),
			generateInitScript(name),
			{ mode: 0o700 },
		);

		return config;
	}

	async get(name: string): Promise<TemplateConfig> {
		assertNoPathTraversal(name);
		const normalized = normalizeTemplateName(name);
		if (!normalized) {
			throw new TemplateNotFoundError(name);
		}

		const configPath = join(this.basePath, normalized, CONFIG_NAME);
		try {
			const data = await readFile(configPath, "utf8");
			return parseAndValidateConfig(data, configPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				throw new TemplateNotFoundError(name);
			}
			throw error;
		}
	}

	async list(): Promise<TemplateConfig[]> {
		let entries: { isDirectory(): boolean; name: string }[];
		try {
			entries = await readdir(this.basePath, { withFileTypes: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return [];
			}
			throw error;
		}

		const configs: TemplateConfig[] = [];
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			try {
				const data = await readFile(
					join(this.basePath, entry.name, CONFIG_NAME),
					"utf8",
				);
				configs.push(
					parseAndValidateConfig(
						data,
						join(this.basePath, entry.name, CONFIG_NAME),
					),
				);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw error;
			}
		}

		configs.sort((a, b) => a.created_at.localeCompare(b.created_at));
		return configs;
	}

	async remove(name: string): Promise<void> {
		assertNoPathTraversal(name);
		const normalized = normalizeTemplateName(name);
		if (!normalized) {
			throw new TemplateNotFoundError(name);
		}

		const templateDir = join(this.basePath, normalized);
		try {
			await stat(templateDir);
		} catch {
			throw new TemplateNotFoundError(name);
		}

		await rm(templateDir, { recursive: true });
	}

	async exists(name: string): Promise<boolean> {
		try {
			assertNoPathTraversal(name);
		} catch {
			return false;
		}
		const normalized = normalizeTemplateName(name);
		if (!normalized) return false;

		try {
			await stat(join(this.basePath, normalized, CONFIG_NAME));
			return true;
		} catch {
			return false;
		}
	}

	async getInitScript(name: string): Promise<TemplateInitScript> {
		assertNoPathTraversal(name);
		const normalized = normalizeTemplateName(name);
		if (!normalized) {
			throw new TemplateNotFoundError(name);
		}
		const templateDir = join(this.basePath, normalized);

		// Try 'init' first, fall back to legacy 'init.sh'
		for (const fileName of [INIT_FILE_NAME, INIT_SCRIPT_NAME_LEGACY]) {
			try {
				const script = await readFile(join(templateDir, fileName), "utf8");
				return { name, normalized, script };
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					continue;
				}
				throw error;
			}
		}

		throw new TemplateNotFoundError(name);
	}

	async getInitScriptPath(name: string): Promise<string> {
		assertNoPathTraversal(name);
		const normalized = normalizeTemplateName(name);
		if (!normalized) {
			throw new TemplateNotFoundError(name);
		}

		const templateDir = join(this.basePath, normalized);

		// Try 'init' first, fall back to legacy 'init.sh'
		for (const fileName of [INIT_FILE_NAME, INIT_SCRIPT_NAME_LEGACY]) {
			const filePath = join(templateDir, fileName);
			try {
				await stat(filePath);
				return filePath;
			} catch {
				// File not found, try next
			}
		}

		throw new TemplateNotFoundError(name);
	}
}
