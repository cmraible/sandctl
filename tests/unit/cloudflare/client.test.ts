import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { CloudflareClient } from "@/cloudflare/client";

describe("cloudflare/client", () => {
	let server: ReturnType<typeof Bun.serve>;
	let requests: Array<{ method: string; url: string; body: unknown }>;
	let nextResponse: { status: number; body: unknown };

	beforeEach(() => {
		requests = [];
		nextResponse = { status: 200, body: { success: true, errors: [], result: {} } };

		server = Bun.serve({
			port: 0,
			fetch(req) {
				const url = new URL(req.url);
				const entry: { method: string; url: string; body: unknown } = {
					method: req.method,
					url: url.pathname + url.search,
					body: null,
				};
				const p = req
					.json()
					.then((b) => {
						entry.body = b;
					})
					.catch(() => {});
				requests.push(entry);
				return p.then(
					() =>
						new Response(JSON.stringify(nextResponse.body), {
							status: nextResponse.status,
							headers: { "Content-Type": "application/json" },
						}),
				);
			},
		});
	});

	afterEach(() => {
		server.stop(true);
	});

	function client(zoneId = "zone-123") {
		return new CloudflareClient(
			"cf-token",
			zoneId,
			`http://localhost:${server.port}`,
		);
	}

	test("createDNSRecord sends correct request", async () => {
		const record = {
			id: "rec-1",
			type: "A",
			name: "test.example.com",
			content: "1.2.3.4",
			ttl: 60,
			proxied: false,
		};
		nextResponse = {
			status: 200,
			body: { success: true, errors: [], result: record },
		};

		const result = await client().createDNSRecord("test.example.com", "1.2.3.4");

		expect(requests).toHaveLength(1);
		expect(requests[0].method).toBe("POST");
		expect(requests[0].url).toBe("/zones/zone-123/dns_records");
		expect(requests[0].body).toEqual({
			type: "A",
			name: "test.example.com",
			content: "1.2.3.4",
			ttl: 60,
			proxied: false,
		});
		expect(result).toEqual(record);
	});

	test("deleteDNSRecord sends DELETE request", async () => {
		nextResponse = {
			status: 200,
			body: { success: true, errors: [], result: { id: "rec-1" } },
		};

		await client().deleteDNSRecord("rec-1");

		expect(requests).toHaveLength(1);
		expect(requests[0].method).toBe("DELETE");
		expect(requests[0].url).toBe(
			"/zones/zone-123/dns_records/rec-1",
		);
	});

	test("listDNSRecords filters by name", async () => {
		nextResponse = {
			status: 200,
			body: { success: true, errors: [], result: [] },
		};

		await client().listDNSRecords("test.example.com");

		expect(requests).toHaveLength(1);
		expect(requests[0].method).toBe("GET");
		expect(requests[0].url).toContain("name=test.example.com");
		expect(requests[0].url).toContain("type=A");
	});

	test("throws on API error", async () => {
		nextResponse = {
			status: 400,
			body: {
				success: false,
				errors: [{ code: 1000, message: "Invalid zone" }],
				result: null,
			},
		};

		await expect(
			client().createDNSRecord("test.example.com", "1.2.3.4"),
		).rejects.toThrow("Cloudflare API error: Invalid zone");
	});
});
