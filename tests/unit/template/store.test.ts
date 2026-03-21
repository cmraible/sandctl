import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	TemplateAlreadyExistsError,
	TemplateNotFoundError,
	TemplateStore,
} from "@/template/store";

describe("template/store", () => {
	test("loads init file from normalized template directory", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const templateDir = join(root, "my-api");
		await mkdir(templateDir, { recursive: true });
		await writeFile(join(templateDir, "init"), "#!/bin/sh\necho hi\n");

		const store = new TemplateStore(root);
		const loaded = await store.getInitScript("My API");

		expect(loaded).toEqual({
			name: "My API",
			normalized: "my-api",
			script: "#!/bin/sh\necho hi\n",
		});
	});

	test("falls back to legacy init.sh when init does not exist", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const templateDir = join(root, "my-api");
		await mkdir(templateDir, { recursive: true });
		await writeFile(join(templateDir, "init.sh"), "#!/bin/sh\necho legacy\n");

		const store = new TemplateStore(root);
		const loaded = await store.getInitScript("My API");

		expect(loaded).toEqual({
			name: "My API",
			normalized: "my-api",
			script: "#!/bin/sh\necho legacy\n",
		});
	});

	test("prefers init over init.sh when both exist", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const templateDir = join(root, "my-api");
		await mkdir(templateDir, { recursive: true });
		await writeFile(
			join(templateDir, "init"),
			"#cloud-config\npackages:\n  - git\n",
		);
		await writeFile(join(templateDir, "init.sh"), "#!/bin/sh\necho legacy\n");

		const store = new TemplateStore(root);
		const loaded = await store.getInitScript("My API");

		expect(loaded.script).toContain("#cloud-config");
	});

	test("throws TemplateNotFoundError when template script is missing", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		await expect(store.getInitScript("Ghost")).rejects.toBeInstanceOf(
			TemplateNotFoundError,
		);
	});

	test("throws TemplateNotFoundError when template name normalizes to empty", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		await writeFile(join(root, "init.sh"), "#!/bin/sh\necho base\n");
		const store = new TemplateStore(root);

		await expect(store.getInitScript("   ")).rejects.toBeInstanceOf(
			TemplateNotFoundError,
		);
		await expect(store.getInitScript("!!!")).rejects.toBeInstanceOf(
			TemplateNotFoundError,
		);
	});

	test("add creates template directory with config.yaml and init", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		const config = await store.add("Ghost");

		expect(config.template).toBe("ghost");
		expect(config.original_name).toBe("Ghost");
		expect(config.created_at).toBeTruthy();

		// Verify config.yaml exists
		const configStat = await stat(join(root, "ghost", "config.yaml"));
		expect(configStat.mode & 0o777).toBe(0o600);

		// Verify init exists and is executable
		const scriptStat = await stat(join(root, "ghost", "init"));
		expect(scriptStat.mode & 0o777).toBe(0o700);
	});

	test("add throws TemplateAlreadyExistsError for duplicate", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		await store.add("Ghost");
		await expect(store.add("Ghost")).rejects.toBeInstanceOf(
			TemplateAlreadyExistsError,
		);
	});

	test("add throws for empty name", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		await expect(store.add("")).rejects.toThrow("template name is required");
		await expect(store.add("!!!")).rejects.toThrow("template name is required");
	});

	test("get returns template config from config.yaml", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);
		await store.add("Ghost");

		const config = await store.get("Ghost");
		expect(config.template).toBe("ghost");
		expect(config.original_name).toBe("Ghost");
	});

	test("get throws TemplateNotFoundError for missing template", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		await expect(store.get("Nope")).rejects.toBeInstanceOf(
			TemplateNotFoundError,
		);
	});

	test("list returns all templates sorted by created_at", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		await store.add("Alpha");
		// Small delay ensures distinct created_at timestamps for reliable sort order
		await new Promise((r) => setTimeout(r, 10));
		await store.add("Beta");

		const templates = await store.list();
		expect(templates).toHaveLength(2);
		expect(templates[0].original_name).toBe("Alpha");
		expect(templates[1].original_name).toBe("Beta");
	});

	test("list returns empty array when no templates exist", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		const templates = await store.list();
		expect(templates).toEqual([]);
	});

	test("remove deletes template directory", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		await store.add("Ghost");
		expect(await store.exists("Ghost")).toBe(true);

		await store.remove("Ghost");
		expect(await store.exists("Ghost")).toBe(false);
	});

	test("remove throws TemplateNotFoundError for missing template", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		await expect(store.remove("Nope")).rejects.toBeInstanceOf(
			TemplateNotFoundError,
		);
	});

	test("exists returns true for existing template, false otherwise", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		expect(await store.exists("Ghost")).toBe(false);
		await store.add("Ghost");
		expect(await store.exists("Ghost")).toBe(true);
	});

	test("getInitScriptPath returns path to init for new templates", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		await store.add("Ghost");
		const scriptPath = await store.getInitScriptPath("Ghost");
		expect(scriptPath).toBe(join(root, "ghost", "init"));
	});

	test("getInitScriptPath falls back to init.sh for legacy templates", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const templateDir = join(root, "ghost");
		await mkdir(templateDir, { recursive: true });
		await writeFile(join(templateDir, "init.sh"), "#!/bin/sh\necho legacy\n");

		const store = new TemplateStore(root);
		const scriptPath = await store.getInitScriptPath("Ghost");
		expect(scriptPath).toBe(join(root, "ghost", "init.sh"));
	});

	test("getInitScriptPath throws for missing template", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		await expect(store.getInitScriptPath("Nope")).rejects.toBeInstanceOf(
			TemplateNotFoundError,
		);
	});

	test("get throws when config.yaml is missing required fields", async () => {
		// Write a config.yaml that is valid YAML but missing required fields
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const templateDir = join(root, "partial");
		await mkdir(templateDir, { recursive: true });
		await writeFile(
			join(templateDir, "config.yaml"),
			"some_random_key: value\n",
		);

		const store = new TemplateStore(root);
		await expect(store.get("partial")).rejects.toThrow(
			/invalid|missing|required/i,
		);
	});

	test("list skips entries with missing required fields and throws", async () => {
		// A config.yaml missing required fields should cause list() to throw
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const templateDir = join(root, "partial");
		await mkdir(templateDir, { recursive: true });
		await writeFile(
			join(templateDir, "config.yaml"),
			"some_random_key: value\n",
		);

		const store = new TemplateStore(root);
		await expect(store.list()).rejects.toThrow(/invalid|missing|required/i);
	});

	test("add rejects template names containing path traversal sequences", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		await expect(store.add("../etc/passwd")).rejects.toThrow(
			/traversal|invalid/i,
		);
		await expect(store.add("foo/../../bar")).rejects.toThrow(
			/traversal|invalid/i,
		);
		await expect(store.add("..")).rejects.toThrow(/traversal|invalid/i);
	});

	test("get rejects template names containing path traversal sequences", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		await expect(store.get("../etc/passwd")).rejects.toThrow(
			/traversal|invalid/i,
		);
	});

	test("list propagates non-ENOENT errors from config reads", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const store = new TemplateStore(root);

		// Create a template dir but make config.yaml a directory (not a file)
		// so readFile throws EISDIR — a real I/O error, not just missing file
		const templateDir = join(root, "bad-template");
		await mkdir(templateDir, { recursive: true });
		await mkdir(join(templateDir, "config.yaml"), { recursive: true });

		await expect(store.list()).rejects.toThrow();
	});
});
