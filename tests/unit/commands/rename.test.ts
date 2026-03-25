import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import { runRename } from "@/commands/rename";
import type { SSHClientLike } from "@/ssh/client";
import { makeRunningSession } from "../../support/fixtures";

function makeStore(sessions = [makeRunningSession()]) {
	const stored = [...sessions];
	return {
		get: async (id: string) => {
			const found = stored.find((s) => s.id === id);
			if (!found) {
				const { NotFoundError } = await import("@/session/types");
				throw new NotFoundError(id);
			}
			return found;
		},
		rename: async (oldId: string, newId: string) => {
			const index = stored.findIndex((s) => s.id === oldId);
			if (index === -1) {
				const { NotFoundError } = await import("@/session/types");
				throw new NotFoundError(oldId);
			}
			stored[index] = { ...stored[index], id: newId };
		},
		sessions: () => stored,
	};
}

function noopConfig() {
	return {
		loadConfig: async () => ({
			default_provider: "hetzner",
			providers: {},
		}),
		resolveProvider: () => {
			throw new Error("no provider");
		},
	};
}

function fakeSSHClient(commands: string[]) {
	return () => ({
		connect: async () => {},
		close: async () => {},
		exec: async (cmd: string) => {
			commands.push(cmd);
			const channel = new EventEmitter() as EventEmitter & {
				stderr: EventEmitter;
				write: (data: string) => void;
				end: () => void;
			};
			channel.stderr = new EventEmitter();
			channel.write = () => {};
			channel.end = () => {};
			// Emit close on next tick so collectExecResult resolves
			process.nextTick(() => channel.emit("close", 0));
			return channel as unknown as ReturnType<SSHClientLike["exec"]>;
		},
	});
}

describe("commands/rename", () => {
	test("renames a session and returns old and new ids", async () => {
		const store = makeStore();
		const result = await runRename(
			"alice",
			"bob",
			{ silent: true },
			{ store, ...noopConfig() },
		);

		expect(result).toEqual({ old_id: "alice", new_id: "bob" });
		expect(store.sessions()[0].id).toBe("bob");
	});

	test("normalizes both names to lowercase", async () => {
		const store = makeStore();
		const result = await runRename(
			"Alice",
			"Bob",
			{ silent: true },
			{ store, ...noopConfig() },
		);

		expect(result).toEqual({ old_id: "alice", new_id: "bob" });
	});

	test("rejects with exit code 4 when session not found", async () => {
		const store = makeStore([]);
		await expect(
			runRename(
				"missing",
				"newname",
				{ silent: true },
				{ store, ...noopConfig() },
			),
		).rejects.toMatchObject({ exitCode: 4 });
	});

	test("rejects invalid old name format", async () => {
		const store = makeStore();
		await expect(
			runRename(
				"bad-name!",
				"good",
				{ silent: true },
				{ store, ...noopConfig() },
			),
		).rejects.toThrow("invalid session name format");
	});

	test("rejects invalid new name format", async () => {
		const store = makeStore();
		await expect(
			runRename(
				"alice",
				"bad-name!",
				{ silent: true },
				{ store, ...noopConfig() },
			),
		).rejects.toThrow("invalid session name format");
	});

	test("rejects when old and new names are the same", async () => {
		const store = makeStore();
		await expect(
			runRename("alice", "alice", { silent: true }, { store, ...noopConfig() }),
		).rejects.toThrow("same as the current name");
	});

	test("renames on provider when config is available", async () => {
		const store = makeStore();
		let providerRenamed = false;

		const result = await runRename(
			"alice",
			"bob",
			{ silent: true },
			{
				store,
				loadConfig: async () => ({
					default_provider: "hetzner",
					providers: {
						hetzner: { token: "test" },
					},
				}),
				resolveProvider: () =>
					({
						client: {
							updateServer: async (_id: string, _updates: { name: string }) => {
								providerRenamed = true;
								return {};
							},
						},
					}) as ReturnType<typeof import("@/provider/registry").get>,
			},
		);

		expect(result.new_id).toBe("bob");
		expect(providerRenamed).toBe(true);
	});

	test("proceeds with local rename even if provider rename fails", async () => {
		const store = makeStore();

		const result = await runRename(
			"alice",
			"bob",
			{ silent: true },
			{
				store,
				loadConfig: async () => {
					throw new Error("config not found");
				},
				resolveProvider: () => {
					throw new Error("no provider");
				},
			},
		);

		expect(result).toEqual({ old_id: "alice", new_id: "bob" });
		expect(store.sessions()[0].id).toBe("bob");
	});

	test("updates hostname on VM via SSH when session is running", async () => {
		const store = makeStore();
		const commands: string[] = [];

		await runRename(
			"alice",
			"bob",
			{ silent: true },
			{
				store,
				loadConfig: async () => ({
					default_provider: "hetzner",
					ssh_public_key: "~/.ssh/id_ed25519.pub",
					providers: {},
				}),
				resolveProvider: () => {
					throw new Error("no provider");
				},
				createSSHClient: fakeSSHClient(commands),
			},
		);

		expect(commands).toContain("hostnamectl set-hostname bob");
		expect(commands).toContain("sed -i 's/\\balice\\b/bob/g' /etc/hosts");
	});

	test("skips hostname update when session is not running", async () => {
		const store = makeStore([makeRunningSession({ status: "stopped" })]);
		const commands: string[] = [];

		await runRename(
			"alice",
			"bob",
			{ silent: true },
			{
				store,
				...noopConfig(),
				createSSHClient: fakeSSHClient(commands),
			},
		);

		expect(commands).toHaveLength(0);
	});

	test("proceeds with local rename even if SSH hostname update fails", async () => {
		const store = makeStore();

		const result = await runRename(
			"alice",
			"bob",
			{ silent: true },
			{
				store,
				loadConfig: async () => ({
					default_provider: "hetzner",
					ssh_public_key: "~/.ssh/id_ed25519.pub",
					providers: {},
				}),
				resolveProvider: () => {
					throw new Error("no provider");
				},
				createSSHClient: () => ({
					connect: async () => {
						throw new Error("connection refused");
					},
					close: async () => {},
					exec: async () => {
						throw new Error("unreachable");
					},
				}),
			},
		);

		expect(result).toEqual({ old_id: "alice", new_id: "bob" });
		expect(store.sessions()[0].id).toBe("bob");
	});
});
