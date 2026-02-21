import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDestroy } from "@/commands/destroy";
import { clearProviders, registerProvider } from "@/provider";
import { SessionStore } from "@/session/store";
import type { Session } from "@/session/types";

describe("commands/destroy", () => {
	let store: SessionStore;
	let logSpy: ReturnType<typeof spyOn>;
	let warnSpy: ReturnType<typeof spyOn>;

	const session: Session = {
		id: "alice",
		status: "running",
		provider: "hetzner",
		provider_id: "123",
		ip_address: "1.2.3.4",
		created_at: "2026-02-20T00:00:00Z",
	};

	beforeEach(async () => {
		const dir = await mkdtemp(join(tmpdir(), "sandctl-destroy-test-"));
		store = new SessionStore(join(dir, "sessions.json"));
		logSpy = spyOn(console, "log").mockImplementation(() => {});
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
		clearProviders();
	});

	afterEach(() => {
		logSpy.mockRestore();
		warnSpy.mockRestore();
		clearProviders();
	});

	test("missing session throws CommandExitError with code 4", async () => {
		await expect(
			runDestroy("missing", { force: true }, store),
		).rejects.toMatchObject({
			exitCode: 4,
		});
	});

	test("destroy is case-insensitive", async () => {
		await store.add(session);
		registerProvider("hetzner", {
			async getVM() {
				return { id: "123", status: "running" };
			},
			async deleteVM() {},
		});
		await runDestroy("Alice", { force: true }, store);
		await expect(store.get("alice")).rejects.toBeDefined();
	});

	test("legacy sessions require force for local-only removal", async () => {
		await store.add({
			...session,
			id: "legacy",
			provider: "",
			provider_id: "",
		});
		await expect(runDestroy("legacy", { force: false }, store)).rejects.toThrow(
			"legacy format",
		);
		await runDestroy("legacy", { force: true }, store);
		await expect(store.get("legacy")).rejects.toBeDefined();
	});

	test("provider deletion failures are warnings and local cleanup continues", async () => {
		await store.add(session);
		registerProvider("hetzner", {
			async getVM() {
				return { id: "123", status: "running" };
			},
			async deleteVM() {
				throw new Error("boom");
			},
		});
		await runDestroy("alice", { force: true }, store);
		expect(warnSpy).toHaveBeenCalled();
		await expect(store.get("alice")).rejects.toBeDefined();
	});

	test("sessions with unknown providers are still removed locally", async () => {
		await store.add({ ...session, provider: "unknown" });
		await runDestroy("alice", { force: true }, store);
		await expect(store.get("alice")).rejects.toBeDefined();
		expect(warnSpy).not.toHaveBeenCalled();
	});
});
