import { describe, expect, test } from "bun:test";

import type { Config } from "@/config/config";
import { createDNSManager } from "@/dns/manager";

describe("dns/manager", () => {
	test("returns null when DNS config is missing", () => {
		const config: Config = {
			default_provider: "hetzner",
			ssh_key_source: "agent",
		};
		expect(createDNSManager(config)).toBeNull();
	});

	test("returns null when DNS config is partial", () => {
		const config: Config = {
			default_provider: "hetzner",
			ssh_key_source: "agent",
			dns: { domain: "example.com" },
		};
		expect(createDNSManager(config)).toBeNull();
	});

	test("returns manager when DNS config is complete", () => {
		const config: Config = {
			default_provider: "hetzner",
			ssh_key_source: "agent",
			dns: {
				domain: "sandbox.example.com",
				cloudflare_api_token: "cf-token",
				cloudflare_zone_id: "zone-123",
			},
		};
		const manager = createDNSManager(config);
		expect(manager).not.toBeNull();
	});

	test("fqdn constructs correct hostname", () => {
		const config: Config = {
			default_provider: "hetzner",
			ssh_key_source: "agent",
			dns: {
				domain: "sandbox.example.com",
				cloudflare_api_token: "cf-token",
				cloudflare_zone_id: "zone-123",
			},
		};
		const manager = createDNSManager(config);
		expect(manager?.fqdn("my-session")).toBe("my-session.sandbox.example.com");
	});
});
