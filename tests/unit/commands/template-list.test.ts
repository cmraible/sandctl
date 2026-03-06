import { describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { runTemplateList } from "@/commands/template-list";
import { TemplateStore } from "@/template/store";

describe("template list", () => {
	test("shows table with templates", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-list-"));
		const store = new TemplateStore(root);
		await store.add("Ghost");
		await store.add("Alpha");

		const output: string[] = [];
		await runTemplateList({}, store, {
			log: (msg: string) => output.push(msg),
		});

		expect(output.some((m) => m.includes("NAME"))).toBe(true);
		expect(output.some((m) => m.includes("Ghost"))).toBe(true);
		expect(output.some((m) => m.includes("Alpha"))).toBe(true);
	});

	test("shows empty message when no templates", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-list-"));
		const store = new TemplateStore(root);

		const output: string[] = [];
		await runTemplateList({}, store, {
			log: (msg: string) => output.push(msg),
		});

		expect(output.some((m) => m.includes("No templates configured"))).toBe(
			true,
		);
	});

	test("long template names do not overflow the 20-char name column", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-list-"));
		const store = new TemplateStore(root);
		// "Averylongnameexceed" = 19 chars, adding "stwenty" makes it 26 chars total
		// with no space — so char at index 20 would be a letter if not truncated
		await store.add("Averylongnameexceedstwenty");

		const output: string[] = [];
		await runTemplateList({}, store, {
			log: (msg: string) => output.push(msg),
		});

		const dataRow = output.find((m) => m.includes("Averylongname"));
		expect(dataRow).toBeTruthy();

		// The name column is 20 chars wide; position 20 should be a space separator
		// not a letter continuing the overflowing name.
		const charAt20 = (dataRow as string)[20];
		expect(charAt20).toBe(" ");
	});

	test("handles invalid created_at date without crashing", async () => {
		// Write a config.yaml with a bogus date to simulate corrupt data
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-list-"));
		const templateDir = join(root, "bad-date");
		await mkdir(templateDir, { recursive: true });
		await writeFile(
			join(templateDir, "config.yaml"),
			YAML.stringify({
				template: "bad-date",
				original_name: "Bad Date",
				created_at: "not-a-date",
			}),
		);

		const store = new TemplateStore(root);
		const output: string[] = [];

		// Should not throw; should show "invalid date" or fallback text
		await runTemplateList({}, store, {
			log: (msg: string) => output.push(msg),
		});

		const row = output.find((m) => m.includes("Bad Date"));
		expect(row).toBeTruthy();
		// The date column should contain an indication of invalidity, not "Invalid DateTime"
		// which is what Luxon produces without a validity check
		expect(row).not.toMatch(/Invalid DateTime/i);
	});

	test("json option outputs valid JSON array", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-list-"));
		const store = new TemplateStore(root);
		await store.add("Ghost");

		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			await runTemplateList({ json: true }, store);
			expect(logSpy).toHaveBeenCalledTimes(1);
			const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
			expect(Array.isArray(parsed)).toBe(true);
			expect(parsed[0]).toHaveProperty("template");
			expect(parsed[0]).toHaveProperty("original_name", "Ghost");
		} finally {
			logSpy.mockRestore();
		}
	});

	test("json option outputs empty array when no templates", async () => {
		const root = await mkdtemp(join(tmpdir(), "sandctl-tpl-list-"));
		const store = new TemplateStore(root);

		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			await runTemplateList({ json: true }, store);
			expect(logSpy).toHaveBeenCalledTimes(1);
			const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
			expect(parsed).toEqual([]);
		} finally {
			logSpy.mockRestore();
		}
	});
});
