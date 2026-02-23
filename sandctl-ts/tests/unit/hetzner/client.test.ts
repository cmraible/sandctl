import { afterEach, describe, expect, test } from "bun:test";

import { HetznerClient } from "@/hetzner/client";
import {
	ErrAuthFailed,
	ErrNotFound,
	ErrProvisionFailed,
	ErrQuotaExceeded,
} from "@/provider/errors";

const originalFetch = globalThis.fetch;

describe("hetzner/client", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("maps 401 responses to ErrAuthFailed", async () => {
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ error: { message: "invalid token" } }), {
				status: 401,
				headers: { "content-type": "application/json" },
			});

		const client = new HetznerClient("token");
		await expect(client.listServers()).rejects.toBeInstanceOf(ErrAuthFailed);
	});

	test("maps 404 responses to ErrNotFound", async () => {
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ error: { message: "missing" } }), {
				status: 404,
				headers: { "content-type": "application/json" },
			});

		const client = new HetznerClient("token");
		await expect(client.getServer("123")).rejects.toBeInstanceOf(ErrNotFound);
	});

	test("maps quota errors to ErrQuotaExceeded", async () => {
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					error: {
						code: "resource_limit_exceeded",
						message: "quota reached",
					},
				}),
				{
					status: 429,
					headers: { "content-type": "application/json" },
				},
			);

		const client = new HetznerClient("token");
		await expect(
			client.createServer({
				name: "vm",
				server_type: "cpx31",
				image: "ubuntu-24.04",
				location: "ash",
			}),
		).rejects.toBeInstanceOf(ErrQuotaExceeded);
	});

	test("maps fetch transport failures to ErrProvisionFailed with cause", async () => {
		globalThis.fetch = async () => {
			throw new TypeError("network down");
		};

		const client = new HetznerClient("token");
		await expect(client.listServers()).rejects.toMatchObject({
			name: "ErrProvisionFailed",
			cause: expect.any(TypeError),
		});
		await expect(client.listServers()).rejects.toBeInstanceOf(
			ErrProvisionFailed,
		);
	});
});
