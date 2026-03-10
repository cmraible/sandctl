import { describe, expect, test } from "bun:test";

import { runOpen } from "@/commands/open";
import { makeRunningSession } from "../../support/fixtures";

describe("commands/open", () => {
	test("opens http URL with session IP address", async () => {
		let openedURL = "";

		const url = await runOpen(
			"alice",
			{},
			{
				store: {
					get: async () => makeRunningSession(),
				},
				openURL: async (u: string) => {
					openedURL = u;
				},
				log: () => {},
			},
		);

		expect(url).toBe("http://203.0.113.10");
		expect(openedURL).toBe("http://203.0.113.10");
	});

	test("opens https URL when --https flag is set", async () => {
		let openedURL = "";

		const url = await runOpen(
			"alice",
			{ https: true },
			{
				store: {
					get: async () => makeRunningSession(),
				},
				openURL: async (u: string) => {
					openedURL = u;
				},
				log: () => {},
			},
		);

		expect(url).toBe("https://203.0.113.10");
		expect(openedURL).toBe("https://203.0.113.10");
	});

	test("includes port in URL when specified", async () => {
		const url = await runOpen(
			"alice",
			{ port: "3000" },
			{
				store: {
					get: async () => makeRunningSession(),
				},
				openURL: async () => {},
				log: () => {},
			},
		);

		expect(url).toBe("http://203.0.113.10:3000");
	});

	test("omits default port 80 for http", async () => {
		const url = await runOpen(
			"alice",
			{ port: "80" },
			{
				store: {
					get: async () => makeRunningSession(),
				},
				openURL: async () => {},
				log: () => {},
			},
		);

		expect(url).toBe("http://203.0.113.10");
	});

	test("omits default port 443 for https", async () => {
		const url = await runOpen(
			"alice",
			{ port: "443", https: true },
			{
				store: {
					get: async () => makeRunningSession(),
				},
				openURL: async () => {},
				log: () => {},
			},
		);

		expect(url).toBe("https://203.0.113.10");
	});

	test("rejects with exit code 5 when session is not running", async () => {
		await expect(
			runOpen(
				"alice",
				{},
				{
					store: {
						get: async () => makeRunningSession({ status: "failed" }),
					},
					openURL: async () => {},
					log: () => {},
				},
			),
		).rejects.toMatchObject({
			exitCode: 5,
		});
	});

	test("normalizes session name", async () => {
		let lookedUp = "";

		await runOpen(
			"Alice",
			{},
			{
				store: {
					get: async (id: string) => {
						lookedUp = id;
						return makeRunningSession();
					},
				},
				openURL: async () => {},
				log: () => {},
			},
		);

		expect(lookedUp).toBe("alice");
	});
});
