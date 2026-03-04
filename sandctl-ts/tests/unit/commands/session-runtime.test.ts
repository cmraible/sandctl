import { describe, expect, test } from "bun:test";

import {
	assertRunnable,
	buildSSHOptions,
	CommandExitError,
	lookupSession,
	withSSHClient,
} from "@/commands/shared/session-runtime";
import type { Config } from "@/config/config";
import { NotFoundError } from "@/session/types";
import type { SSHClientOptions } from "@/ssh/client";
import { makeRunningSession } from "../../support/fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeClient(events: string[]) {
	return {
		connect: async () => {
			events.push("client.connect");
		},
		close: async () => {
			events.push("client.close");
		},
		exec: async () => {
			throw new Error("not used");
		},
		shell: async () => {
			throw new Error("not used");
		},
	};
}

// ---------------------------------------------------------------------------
// CommandExitError
// ---------------------------------------------------------------------------

describe("CommandExitError", () => {
	test("stores exitCode", () => {
		const err = new CommandExitError("oops", 5);
		expect(err.message).toBe("oops");
		expect(err.exitCode).toBe(5);
		expect(err).toBeInstanceOf(Error);
	});
});

// ---------------------------------------------------------------------------
// assertRunnable
// ---------------------------------------------------------------------------

describe("assertRunnable", () => {
	test("passes for a running session with an IP address", () => {
		expect(() => assertRunnable(makeRunningSession())).not.toThrow();
	});

	test("throws CommandExitError(5) when session is not running", () => {
		expect(() =>
			assertRunnable(makeRunningSession({ status: "stopped" })),
		).toThrow(CommandExitError);
		expect(() =>
			assertRunnable(makeRunningSession({ status: "stopped" })),
		).toThrow("is not running");

		try {
			assertRunnable(makeRunningSession({ status: "failed" }));
			throw new Error("expected throw");
		} catch (err) {
			expect(err).toBeInstanceOf(CommandExitError);
			expect((err as CommandExitError).exitCode).toBe(5);
		}
	});

	test("throws CommandExitError(5) when session has no IP address", () => {
		try {
			assertRunnable(makeRunningSession({ ip_address: "" }));
			throw new Error("expected throw");
		} catch (err) {
			expect(err).toBeInstanceOf(CommandExitError);
			expect((err as CommandExitError).exitCode).toBe(5);
			expect((err as Error).message).toMatch(/no IP address/);
		}
	});
});

// ---------------------------------------------------------------------------
// buildSSHOptions
// ---------------------------------------------------------------------------

describe("buildSSHOptions", () => {
	test("returns agent options when ssh_key_source is agent", () => {
		const config: Config = {
			default_provider: "hetzner",
			ssh_key_source: "agent",
		};
		const opts = buildSSHOptions(config, "10.0.0.1");
		expect(opts).toEqual({
			host: "10.0.0.1",
			username: "agent",
			useAgent: true,
		} satisfies SSHClientOptions);
	});

	test("derives private key path from public key path", () => {
		const config: Config = {
			default_provider: "hetzner",
			ssh_public_key: "/home/user/.ssh/id_ed25519.pub",
		};
		const opts = buildSSHOptions(config, "10.0.0.2");
		expect(opts).toEqual({
			host: "10.0.0.2",
			username: "agent",
			privateKeyPath: "/home/user/.ssh/id_ed25519.pub".slice(0, -4),
		} satisfies SSHClientOptions);
	});

	test("uses key path without stripping if no .pub extension", () => {
		const config: Config = {
			default_provider: "hetzner",
			ssh_public_key: "/home/user/.ssh/id_ed25519",
		};
		const opts = buildSSHOptions(config, "10.0.0.3");
		expect(opts).toMatchObject({
			privateKeyPath: "/home/user/.ssh/id_ed25519",
		});
	});

	test("throws when neither agent nor public key is configured", () => {
		const config: Config = {
			default_provider: "hetzner",
		};
		expect(() => buildSSHOptions(config, "10.0.0.4")).toThrow(
			"ssh_public_key not configured",
		);
	});
});

// ---------------------------------------------------------------------------
// lookupSession
// ---------------------------------------------------------------------------

describe("lookupSession", () => {
	test("returns the session for a valid normalized name", async () => {
		const session = makeRunningSession();
		const result = await lookupSession("Alice", {
			get: async (id) => {
				expect(id).toBe("alice");
				return session;
			},
		});
		expect(result).toBe(session);
	});

	test("throws CommandExitError(4) when session is not found", async () => {
		await expect(
			lookupSession("alice", {
				get: async () => {
					throw new NotFoundError("alice");
				},
			}),
		).rejects.toMatchObject({
			exitCode: 4,
		});
	});

	test("re-throws non-NotFoundError errors", async () => {
		const boom = new Error("store exploded");
		await expect(
			lookupSession("alice", {
				get: async () => {
					throw boom;
				},
			}),
		).rejects.toBe(boom);
	});

	test("throws on invalid session name format", async () => {
		await expect(
			lookupSession("bad name!", {
				get: async () => {
					throw new Error("should not be called");
				},
			}),
		).rejects.toThrow("invalid session name format");
	});
});

// ---------------------------------------------------------------------------
// withSSHClient
// ---------------------------------------------------------------------------

describe("withSSHClient", () => {
	test("connects, runs callback, then closes", async () => {
		const events: string[] = [];
		const client = makeFakeClient(events);

		const result = await withSSHClient(client, async (c) => {
			events.push("callback");
			expect(c).toBe(client);
			return 42;
		});

		expect(result).toBe(42);
		expect(events).toEqual(["client.connect", "callback", "client.close"]);
	});

	test("closes client even when callback throws", async () => {
		const events: string[] = [];
		const client = makeFakeClient(events);

		await expect(
			withSSHClient(client, async () => {
				events.push("callback");
				throw new Error("callback failed");
			}),
		).rejects.toThrow("callback failed");

		expect(events).toEqual(["client.connect", "callback", "client.close"]);
	});

	test("closes client even when connect throws", async () => {
		const events: string[] = [];
		const client = {
			...makeFakeClient(events),
			connect: async () => {
				events.push("client.connect");
				throw new Error("connect failed");
			},
		};

		await expect(
			withSSHClient(client, async () => {
				events.push("callback");
			}),
		).rejects.toThrow("connect failed");

		expect(events).toContain("client.connect");
		expect(events).toContain("client.close");
		expect(events).not.toContain("callback");
	});
});
