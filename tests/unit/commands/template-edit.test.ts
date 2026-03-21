import { describe, expect, mock, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTemplateEdit } from "@/commands/template-edit";
import { TemplateStore } from "@/template/store";

describe("template edit", () => {
	test("opens editor for existing template", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-edit-"));
		const store = new TemplateStore(root);
		await store.add("Ghost");

		const openEditor = mock(async () => {});
		await runTemplateEdit("Ghost", store, { openEditor });

		expect(openEditor).toHaveBeenCalledTimes(1);
		const calledPath = openEditor.mock.calls[0][0] as string;
		expect(calledPath).toContain("ghost");
		expect(calledPath).toContain("/init");
	});

	test("throws for non-existent template", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-edit-"));
		const store = new TemplateStore(root);

		await expect(
			runTemplateEdit("Nope", store, { openEditor: async () => {} }),
		).rejects.toThrow(/not found/);
	});
});
