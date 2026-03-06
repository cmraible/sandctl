import { describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTemplateRemove } from "@/commands/template-remove";
import { TemplateStore } from "@/template/store";
import type { TemplateStoreLike } from "@/template/types";

describe("template remove", () => {
	test("removes template with --force", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-rm-"));
		const store = new TemplateStore(root);
		await store.add("Ghost");

		const output: string[] = [];
		await runTemplateRemove("Ghost", { force: true }, store, {
			log: (msg: string) => output.push(msg),
			confirm: async () => true,
		});

		expect(await store.exists("Ghost")).toBe(false);
		expect(output.some((m) => m.includes("deleted"))).toBe(true);
	});

	test("prompts for confirmation without --force", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-rm-"));
		const store = new TemplateStore(root);
		await store.add("Ghost");

		const confirmFn = mock(async () => true);
		await runTemplateRemove("Ghost", { force: false }, store, {
			log: () => {},
			confirm: confirmFn,
		});

		expect(confirmFn).toHaveBeenCalledTimes(1);
		expect(await store.exists("Ghost")).toBe(false);
	});

	test("cancels when confirmation denied", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-rm-"));
		const store = new TemplateStore(root);
		await store.add("Ghost");

		const output: string[] = [];
		await runTemplateRemove("Ghost", { force: false }, store, {
			log: (msg: string) => output.push(msg),
			confirm: async () => false,
		});

		expect(await store.exists("Ghost")).toBe(true);
		expect(output.some((m) => m.includes("Canceled"))).toBe(true);
	});

	test("throws for non-existent template", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-rm-"));
		const store = new TemplateStore(root);

		await expect(
			runTemplateRemove("Nope", { force: true }, store, {
				log: () => {},
				confirm: async () => true,
			}),
		).rejects.toThrow(/not found/);
	});

	test("does not call exists() before remove() to avoid TOCTOU race condition", async () => {
		// The safe approach is to call remove() directly and let it handle
		// the not-found case — rather than exists() then remove() (TOCTOU).
		// This test verifies exists() is never called during a remove operation.
		const existsCalled = { count: 0 };
		const mockStore: TemplateStoreLike = {
			exists: async () => {
				existsCalled.count++;
				return true;
			},
			remove: async () => {},
			add: async () => ({ template: "", original_name: "", created_at: "" }),
			get: async () => ({ template: "", original_name: "", created_at: "" }),
			list: async () => [],
			getInitScript: async () => ({ name: "", normalized: "", script: "" }),
			getInitScriptPath: async () => "",
		};

		await runTemplateRemove("Ghost", { force: true }, mockStore, {
			log: () => {},
			confirm: async () => true,
		});

		expect(existsCalled.count).toBe(0);
	});

	test("json option skips confirmation and outputs JSON", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-rm-"));
		const store = new TemplateStore(root);
		await store.add("Ghost");

		const confirmFn = mock(async () => true);
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			await runTemplateRemove("Ghost", { force: false, json: true }, store, {
				log: () => {},
				confirm: confirmFn,
			});

			expect(confirmFn).not.toHaveBeenCalled();
			expect(await store.exists("Ghost")).toBe(false);
			expect(logSpy).toHaveBeenCalledTimes(1);
			const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
			expect(parsed).toEqual({ name: "Ghost", removed: true });
		} finally {
			logSpy.mockRestore();
		}
	});
});
