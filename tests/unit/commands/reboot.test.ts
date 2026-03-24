import { describe, expect, test } from "bun:test";

import { runReboot } from "@/commands/reboot";
import { makeRunningSession } from "../../support/fixtures";

const fakeProviderConfig = { token: "test-token" };

function makeDeps(
	overrides: {
		session?: ReturnType<typeof makeRunningSession>;
		reboot?: (id: string) => Promise<void>;
		providerConfig?: Record<string, unknown> | null;
	} = {},
) {
	const session = overrides.session ?? makeRunningSession();
	const rebootFn = overrides.reboot ?? (async () => {});
	const providerConfig =
		overrides.providerConfig === null
			? undefined
			: (overrides.providerConfig ?? fakeProviderConfig);

	return {
		store: { get: async () => session },
		loadConfig: async () => ({
			default_provider: "hetzner",
			ssh_public_key: "~/.ssh/id_ed25519.pub",
			providers: providerConfig ? { [session.provider]: providerConfig } : {},
		}),
		resolveProvider: () => ({
			name: () => "hetzner",
			create: async () => {
				throw new Error("not implemented");
			},
			get: async () => {
				throw new Error("not implemented");
			},
			delete: async () => {
				throw new Error("not implemented");
			},
			reboot: rebootFn,
			list: async () => [],
			waitReady: async () => {},
			ensureSSHKey: async () => "",
		}),
	};
}

describe("commands/reboot", () => {
	test("reboots a running session", async () => {
		let rebootedId = "";
		const deps = makeDeps({
			reboot: async (id) => {
				rebootedId = id;
			},
		});

		const result = await runReboot("alice", { silent: true }, deps);

		expect(result.id).toBe("alice");
		expect(result.rebooted).toBe(true);
		expect(rebootedId).toBe("vm-123");
	});

	test("normalizes session name", async () => {
		let lookedUp = "";
		const deps = makeDeps();
		deps.store = {
			get: async (id: string) => {
				lookedUp = id;
				return makeRunningSession();
			},
		};

		await runReboot("Alice", { silent: true }, deps);

		expect(lookedUp).toBe("alice");
	});

	test("rejects with exit code 4 when session not found", async () => {
		const { NotFoundError } = await import("@/session/types");

		const deps = makeDeps();
		deps.store = {
			get: async () => {
				throw new NotFoundError("missing");
			},
		};

		await expect(
			runReboot("missing", { silent: true }, deps),
		).rejects.toMatchObject({
			exitCode: 4,
		});
	});

	test("throws when session has no provider_id", async () => {
		const deps = makeDeps({
			session: makeRunningSession({ provider_id: "" }),
		});

		await expect(runReboot("alice", { silent: true }, deps)).rejects.toThrow(
			"legacy format",
		);
	});

	test("throws when provider is not configured", async () => {
		const deps = makeDeps({ providerConfig: null });

		await expect(runReboot("alice", { silent: true }, deps)).rejects.toThrow(
			"not configured",
		);
	});
});
