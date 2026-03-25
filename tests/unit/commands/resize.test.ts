import { describe, expect, test } from "bun:test";

import { runResize } from "@/commands/resize";
import { makeRunningSession } from "../../support/fixtures";

const fakeProviderConfig = { token: "test-token" };

function makeDeps(
	overrides: {
		session?: ReturnType<typeof makeRunningSession>;
		resize?: (
			id: string,
			serverType: string,
			upgradeDisk: boolean,
		) => Promise<void>;
		providerConfig?: Record<string, unknown> | null;
		confirm?: boolean;
		update?: (id: string, updates: Record<string, unknown>) => Promise<void>;
	} = {},
) {
	const session = overrides.session ?? makeRunningSession();
	const resizeFn = overrides.resize ?? (async () => {});
	const updateFn = overrides.update ?? (async () => {});
	const providerConfig =
		overrides.providerConfig === null
			? undefined
			: (overrides.providerConfig ?? fakeProviderConfig);

	return {
		store: {
			get: async () => session,
			update: updateFn,
		},
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
			reboot: async () => {
				throw new Error("not implemented");
			},
			resize: resizeFn,
			list: async () => [],
			waitReady: async () => {},
			ensureSSHKey: async () => "",
		}),
	};
}

describe("commands/resize", () => {
	test("resizes with --force (skips confirmation)", async () => {
		let resizedId = "";
		let resizedType = "";
		let resizedUpgradeDisk = false;
		const deps = makeDeps({
			resize: async (id, serverType, upgradeDisk) => {
				resizedId = id;
				resizedType = serverType;
				resizedUpgradeDisk = upgradeDisk;
			},
		});

		const result = await runResize(
			"alice",
			"cpx41",
			{ force: true, upgradeDisk: false, silent: true },
			deps,
		);

		expect(result.id).toBe("alice");
		expect(result.serverType).toBe("cpx41");
		expect(result.resized).toBe(true);
		expect(resizedId).toBe("vm-123");
		expect(resizedType).toBe("cpx41");
		expect(resizedUpgradeDisk).toBe(false);
	});

	test("passes --upgrade-disk to provider", async () => {
		let receivedUpgradeDisk = false;
		const deps = makeDeps({
			resize: async (_id, _serverType, upgradeDisk) => {
				receivedUpgradeDisk = upgradeDisk;
			},
		});

		await runResize(
			"alice",
			"cpx41",
			{ force: true, upgradeDisk: true, silent: true },
			deps,
		);

		expect(receivedUpgradeDisk).toBe(true);
	});

	test("updates session store after resize", async () => {
		let updatedId = "";
		let updatedFields: Record<string, unknown> = {};
		const deps = makeDeps({
			update: async (id, updates) => {
				updatedId = id;
				updatedFields = updates;
			},
		});

		await runResize(
			"alice",
			"cpx41",
			{ force: true, upgradeDisk: false, silent: true },
			deps,
		);

		expect(updatedId).toBe("alice");
		expect(updatedFields).toEqual({ server_type: "cpx41" });
	});

	test("throws when session has no provider_id", async () => {
		const deps = makeDeps({
			session: makeRunningSession({ provider_id: "" }),
		});

		await expect(
			runResize(
				"alice",
				"cpx41",
				{ force: true, upgradeDisk: false, silent: true },
				deps,
			),
		).rejects.toThrow("legacy format");
	});

	test("throws when provider is not configured", async () => {
		const deps = makeDeps({ providerConfig: null });

		await expect(
			runResize(
				"alice",
				"cpx41",
				{ force: true, upgradeDisk: false, silent: true },
				deps,
			),
		).rejects.toThrow("not configured");
	});

	test("throws when provider does not support resize", async () => {
		const deps = makeDeps();
		// Remove resize from the provider
		deps.resolveProvider = () =>
			({
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
				reboot: async () => {},
				list: async () => [],
				waitReady: async () => {},
				ensureSSHKey: async () => "",
			}) as ReturnType<typeof deps.resolveProvider>;

		await expect(
			runResize(
				"alice",
				"cpx41",
				{ force: true, upgradeDisk: false, silent: true },
				deps,
			),
		).rejects.toThrow("does not support resize");
	});

	test("throws when resize operation fails", async () => {
		const deps = makeDeps({
			resize: async () => {
				throw new Error("Hetzner API timeout");
			},
		});

		await expect(
			runResize(
				"alice",
				"cpx41",
				{ force: true, upgradeDisk: false, silent: true },
				deps,
			),
		).rejects.toThrow("Hetzner API timeout");
	});

	test("rejects with exit code 4 when session not found", async () => {
		const { NotFoundError } = await import("@/session/types");

		const deps = makeDeps();
		deps.store = {
			get: async () => {
				throw new NotFoundError("missing");
			},
			update: async () => {},
		};

		await expect(
			runResize(
				"missing",
				"cpx41",
				{ force: true, upgradeDisk: false, silent: true },
				deps,
			),
		).rejects.toMatchObject({
			exitCode: 4,
		});
	});
});
