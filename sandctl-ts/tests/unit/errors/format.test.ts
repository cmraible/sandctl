import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { formatZodError } from "@/errors/format";

function makeZodError(schema: z.ZodTypeAny, value: unknown): z.ZodError {
	const result = schema.safeParse(value);
	if (result.success) {
		throw new Error("expected schema to fail");
	}
	return result.error;
}

describe("errors/format - formatZodError", () => {
	test("formats a single issue with path and message", () => {
		const schema = z.object({ name: z.string() });
		const err = makeZodError(schema, { name: 42 });
		const msg = formatZodError(err);
		expect(msg).toContain("name:");
		expect(msg).not.toContain('"code"');
	});

	test("uses <root> when path is empty", () => {
		const schema = z.string();
		const err = makeZodError(schema, 42);
		const msg = formatZodError(err);
		expect(msg).toContain("<root>:");
	});

	test("caps at 5 issues and appends remainder count", () => {
		const schema = z.object({
			a: z.string(),
			b: z.string(),
			c: z.string(),
			d: z.string(),
			e: z.string(),
			f: z.string(),
		});
		const err = makeZodError(schema, {
			a: 1,
			b: 2,
			c: 3,
			d: 4,
			e: 5,
			f: 6,
		});
		const msg = formatZodError(err);
		// should have at most 5 issue segments before the "+N more" suffix
		const segments = msg.split("; ");
		const remainder = msg.match(/\(\+(\d+) more\)/);
		// total issues = 6, shown = 5, remainder = 1
		expect(remainder).not.toBeNull();
		expect(remainder?.[1]).toBe("1");
		expect(segments.length).toBeLessThanOrEqual(6); // 5 + possibly the "(+1 more)" appended
	});

	test("no suffix when all issues fit within cap", () => {
		const schema = z.object({ x: z.string() });
		const err = makeZodError(schema, { x: 99 });
		const msg = formatZodError(err);
		expect(msg).not.toContain("more)");
	});

	test("keeps total message short", () => {
		const schema = z.object({
			a: z.string(),
			b: z.string(),
			c: z.string(),
			d: z.string(),
			e: z.string(),
			f: z.string(),
		});
		const err = makeZodError(schema, {
			a: 1,
			b: 2,
			c: 3,
			d: 4,
			e: 5,
			f: 6,
		});
		const msg = formatZodError(err);
		expect(msg.length).toBeLessThan(400);
	});
});
