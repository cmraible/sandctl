/**
 * Core template operations — pure business logic, no CLI dependencies.
 *
 * Handles template CRUD operations. Editor opening and interactive prompts
 * remain in the CLI layer.
 */

import {
	TemplateAlreadyExistsError,
	TemplateNotFoundError,
} from "@/template/store";
import type { TemplateConfig, TemplateStoreLike } from "@/template/types";
import { ValidationError } from "./errors";

// ---------------------------------------------------------------------------
// addTemplate
// ---------------------------------------------------------------------------

/**
 * Create a new template. Returns the template config.
 * Throws `ValidationError` if template already exists or name is empty.
 */
export async function addTemplate(
	name: string,
	store: TemplateStoreLike & {
		add(name: string): Promise<TemplateConfig>;
		getInitScriptPath(name: string): Promise<string>;
	},
): Promise<{ config: TemplateConfig; scriptPath: string }> {
	if (!name.trim()) {
		throw new ValidationError("template name is required");
	}

	let config: TemplateConfig;
	try {
		config = await store.add(name);
	} catch (error) {
		if (error instanceof TemplateAlreadyExistsError) {
			throw new ValidationError(
				`Template '${name}' already exists. Use 'sandctl template edit ${name}' to modify it.`,
			);
		}
		throw error;
	}

	const scriptPath = await store.getInitScriptPath(name);
	return { config, scriptPath };
}

// ---------------------------------------------------------------------------
// removeTemplate
// ---------------------------------------------------------------------------

/**
 * Remove a template by name.
 * Throws `ValidationError` if template not found.
 */
export async function removeTemplate(
	name: string,
	store: TemplateStoreLike & { remove(name: string): Promise<void> },
): Promise<void> {
	try {
		await store.remove(name);
	} catch (error) {
		if (error instanceof TemplateNotFoundError) {
			throw new ValidationError(
				`template '${name}' not found. Use 'sandctl template list' to see available templates`,
			);
		}
		throw error;
	}
}

// ---------------------------------------------------------------------------
// listTemplates
// ---------------------------------------------------------------------------

/**
 * List all configured templates.
 */
export async function listTemplates(
	store: TemplateStoreLike & { list(): Promise<TemplateConfig[]> },
): Promise<TemplateConfig[]> {
	return await store.list();
}

// ---------------------------------------------------------------------------
// showTemplate
// ---------------------------------------------------------------------------

export interface TemplateInitScript {
	name: string;
	script: string;
}

/**
 * Get a template's init script content.
 * Throws `ValidationError` if template not found.
 */
export async function showTemplate(
	name: string,
	store: TemplateStoreLike,
): Promise<TemplateInitScript> {
	try {
		return await store.getInitScript(name);
	} catch (error) {
		if (error instanceof TemplateNotFoundError) {
			throw new ValidationError(
				`template '${name}' not found. Use 'sandctl template list' to see available templates`,
			);
		}
		throw error;
	}
}

// ---------------------------------------------------------------------------
// getTemplateScriptPath
// ---------------------------------------------------------------------------

/**
 * Get the filesystem path to a template's init script (for editing).
 * Throws `ValidationError` if template not found.
 */
export async function getTemplateScriptPath(
	name: string,
	store: TemplateStoreLike & { getInitScriptPath(name: string): Promise<string> },
): Promise<string> {
	try {
		return await store.getInitScriptPath(name);
	} catch (error) {
		if (error instanceof TemplateNotFoundError) {
			throw new ValidationError(
				`template '${name}' not found. Use 'sandctl template list' to see available templates`,
			);
		}
		throw error;
	}
}
