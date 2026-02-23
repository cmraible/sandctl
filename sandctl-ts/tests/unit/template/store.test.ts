import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TemplateNotFoundError, TemplateStore } from "@/template/store";

describe("template/store", () => {
	test("loads init script from normalized template directory", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-template-store-test-"));
		const templateDir = join(root, "my-api");
		await mkdir(templateDir, { recursive: true });
		await writeFile(join(templateDir, "init.sh"), "#!/bin/sh\necho hi\n");

		const store = new TemplateStore(root);
		const loaded = await store.getInitScript("My API");

		expect(loaded).toEqual({
			name: "My API",
			normalized: "my-api",
			script: "#!/bin/sh\necho hi\n",
		});
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
});
