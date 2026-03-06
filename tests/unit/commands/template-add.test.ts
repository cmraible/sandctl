import { describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTemplateAdd } from "@/commands/template-add";
import { TemplateStore } from "@/template/store";

describe("template add", () => {
	test("creates template and reports success", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-add-"));
		const store = new TemplateStore(root);
		const output: string[] = [];
		const openEditor = mock(async () => {});

		await runTemplateAdd("Ghost", {}, store, {
			log: (msg: string) => output.push(msg),
			errLog: (msg: string) => output.push(msg),
			openEditor,
		});

		expect(await store.exists("Ghost")).toBe(true);
		expect(openEditor).toHaveBeenCalledTimes(1);
		expect(output.some((m) => m.includes("Ghost"))).toBe(true);
	});

	test("shows error for duplicate template", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-add-"));
		const store = new TemplateStore(root);
		await store.add("Ghost");

		const errors: string[] = [];
		const openEditor = mock(async () => {});

		await runTemplateAdd("Ghost", {}, store, {
			log: () => {},
			errLog: (msg: string) => errors.push(msg),
			openEditor,
		});

		expect(openEditor).not.toHaveBeenCalled();
		expect(errors.some((m) => m.includes("already exists"))).toBe(true);
	});

	test("throws for empty name", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-add-"));
		const store = new TemplateStore(root);

		await expect(
			runTemplateAdd("", {}, store, {
				log: () => {},
				errLog: () => {},
				openEditor: async () => {},
			}),
		).rejects.toThrow("template name is required");
	});

	test("falls back gracefully when editor fails", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-add-"));
		const store = new TemplateStore(root);
		const output: string[] = [];
		const openEditor = mock(async () => {
			throw new Error("editor crashed");
		});

		await runTemplateAdd("Ghost", {}, store, {
			log: (msg: string) => output.push(msg),
			errLog: (msg: string) => output.push(msg),
			openEditor,
		});

		expect(await store.exists("Ghost")).toBe(true);
		expect(output.some((m) => m.includes("init.sh"))).toBe(true);
	});

	test("json option outputs template config and skips editor", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-add-"));
		const store = new TemplateStore(root);
		const openEditor = mock(async () => {});

		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			await runTemplateAdd("Ghost", { json: true }, store, {
				log: () => {},
				errLog: () => {},
				openEditor,
			});

			expect(openEditor).not.toHaveBeenCalled();
			expect(logSpy).toHaveBeenCalledTimes(1);
			const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
			expect(parsed).toHaveProperty("template", "ghost");
			expect(parsed).toHaveProperty("original_name", "Ghost");
			expect(parsed).toHaveProperty("created_at");
		} finally {
			logSpy.mockRestore();
		}
	});
});
