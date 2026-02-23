import { afterEach, describe, expect, test } from "bun:test";

import type { ProviderConfig } from "@/config/config";
import {
	available,
	clearRegistry,
	ErrUnknownProvider,
	get,
	register,
	registerBuiltinProviders,
} from "@/provider/registry";

describe("provider/registry", () => {
	test("auto-registers hetzner provider on import", () => {
		expect(available()).toContain("hetzner");
	});

	test("builtin registration is idempotent", () => {
		registerBuiltinProviders();
		registerBuiltinProviders();
		expect(available().filter((name) => name === "hetzner")).toHaveLength(1);
	});

	afterEach(() => {
		clearRegistry();
		registerBuiltinProviders();
	});

	test("register stores factory and get builds provider from config", () => {
		const config: ProviderConfig = { token: "token" };
		const provider = {
			name: () => "hetzner",
			create: async () => ({
				id: "1",
				name: "vm-1",
				status: "running" as const,
				ipAddress: "1.2.3.4",
				region: "ash",
				serverType: "cpx31",
				createdAt: "2026-02-20T00:00:00Z",
			}),
			get: async () => ({
				id: "1",
				name: "vm-1",
				status: "running" as const,
				ipAddress: "1.2.3.4",
				region: "ash",
				serverType: "cpx31",
				createdAt: "2026-02-20T00:00:00Z",
			}),
			delete: async () => {},
			list: async () => [],
			waitReady: async () => {},
			ensureSSHKey: async () => "ssh-key-id",
		};

		register("hetzner", (factoryConfig) => {
			expect(factoryConfig).toEqual(config);
			return provider;
		});

		expect(get("hetzner", config)).toBe(provider);
		expect(available()).toEqual(["hetzner"]);
	});

	test("get throws typed error for unknown providers", () => {
		expect(() => get("unknown", { token: "token" })).toThrow(
			new ErrUnknownProvider("unknown"),
		);
	});

	test("register overwrites an existing provider factory", () => {
		const config: ProviderConfig = { token: "token" };
		const firstProvider = {
			name: () => "first",
			create: async () => ({
				id: "1",
				name: "vm-1",
				status: "running" as const,
				ipAddress: "1.2.3.4",
				region: "ash",
				serverType: "cpx31",
				createdAt: "2026-02-20T00:00:00Z",
			}),
			get: async () => ({
				id: "1",
				name: "vm-1",
				status: "running" as const,
				ipAddress: "1.2.3.4",
				region: "ash",
				serverType: "cpx31",
				createdAt: "2026-02-20T00:00:00Z",
			}),
			delete: async () => {},
			list: async () => [],
			waitReady: async () => {},
			ensureSSHKey: async () => "ssh-key-id",
		};
		const secondProvider = {
			...firstProvider,
			name: () => "second",
		};

		register("hetzner", () => firstProvider);
		register("hetzner", () => secondProvider);

		expect(get("hetzner", config)).toBe(secondProvider);
	});

	test("clearRegistry removes providers between test runs", () => {
		register("hetzner", () => {
			throw new Error("not used");
		});
		expect(available()).toEqual(["hetzner"]);

		clearRegistry();

		expect(available()).toEqual([]);
		expect(() => get("hetzner", { token: "token" })).toThrow(
			new ErrUnknownProvider("hetzner"),
		);
	});
});
