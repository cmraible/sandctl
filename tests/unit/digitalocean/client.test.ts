import { afterEach, describe, expect, test } from "bun:test";

import { DigitalOceanClient } from "@/digitalocean/client";
import {
	ErrAuthFailed,
	ErrNotFound,
	ErrProvisionFailed,
	ErrQuotaExceeded,
} from "@/provider/errors";

const originalFetch = globalThis.fetch;

describe("digitalocean/client", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("maps 401 responses to ErrAuthFailed", async () => {
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ message: "invalid token" }), {
				status: 401,
				headers: { "content-type": "application/json" },
			});

		const client = new DigitalOceanClient("token");
		await expect(client.listDroplets()).rejects.toBeInstanceOf(ErrAuthFailed);
	});

	test("maps 404 responses to ErrNotFound", async () => {
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ message: "missing" }), {
				status: 404,
				headers: { "content-type": "application/json" },
			});

		const client = new DigitalOceanClient("token");
		await expect(client.getDroplet("123")).rejects.toBeInstanceOf(ErrNotFound);
	});

	test("maps rate-limit responses to ErrQuotaExceeded", async () => {
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ message: "too many requests" }), {
				status: 429,
				headers: { "content-type": "application/json" },
			});

		const client = new DigitalOceanClient("token");
		await expect(
			client.createDroplet({
				name: "vm",
				region: "nyc1",
				size: "s-4vcpu-8gb",
				image: "ubuntu-24-04-x64",
			}),
		).rejects.toBeInstanceOf(ErrQuotaExceeded);
	});

	test("maps droplet limit errors to ErrQuotaExceeded", async () => {
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({ message: "You have reached your droplet limit." }),
				{
					status: 422,
					headers: { "content-type": "application/json" },
				},
			);

		const client = new DigitalOceanClient("token");
		await expect(
			client.createDroplet({
				name: "vm",
				region: "nyc1",
				size: "s-4vcpu-8gb",
				image: "ubuntu-24-04-x64",
			}),
		).rejects.toBeInstanceOf(ErrQuotaExceeded);
	});

	test("includes DigitalOcean error ids in ErrProvisionFailed", async () => {
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					id: "unprocessable_entity",
					message: "unprocessable request",
				}),
				{
					status: 422,
					headers: { "content-type": "application/json" },
				},
			);

		const client = new DigitalOceanClient("token");
		const error = await client
			.createDroplet({
				name: "vm",
				region: "nyc1",
				size: "s-4vcpu-8gb",
				image: "ubuntu-24-04-x64",
			})
			.catch((caught) => caught);

		expect(error).toBeInstanceOf(ErrProvisionFailed);
		expect(error.message).toBe("unprocessable request (unprocessable_entity)");
	});

	test("maps transport failures to ErrProvisionFailed with cause", async () => {
		globalThis.fetch = async () => {
			throw new TypeError("network down");
		};

		const client = new DigitalOceanClient("token");
		await expect(client.listDroplets()).rejects.toMatchObject({
			name: "ErrProvisionFailed",
			cause: expect.any(TypeError),
		});
	});
});
