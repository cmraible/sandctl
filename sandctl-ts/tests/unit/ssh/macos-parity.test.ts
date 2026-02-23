import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";

import {
	type AgentDiscoveryDeps,
	discoverAgentSockets,
	parseIdentityAgent,
} from "@/ssh/agent";
import type { SSHClientLike, SSHShellChannelLike } from "@/ssh/client";
import { type ConsoleRuntime, openConsole } from "@/ssh/console";

function depsFor(
	overrides: Partial<AgentDiscoveryDeps> = {},
): AgentDiscoveryDeps {
	return {
		homeDir: () => "/Users/Test User",
		readFile: async () => "",
		env: () => undefined,
		pathExists: async () => false,
		...overrides,
	};
}

function createConsoleHarness(runtimeTerm = "xterm-256color") {
	const stdin = new PassThrough() as ConsoleRuntime["stdin"];
	stdin.isTTY = true;
	stdin.isRaw = false;
	stdin.setRawMode = () => {};

	const stdout = new PassThrough() as ConsoleRuntime["stdout"];
	stdout.rows = 24;
	stdout.columns = 80;

	const stderr = new PassThrough();
	const channel = new PassThrough() as SSHShellChannelLike;
	channel.stderr = new PassThrough();

	const runtime = {
		stdin,
		stdout,
		stderr,
		term: runtimeTerm,
	} satisfies ConsoleRuntime;

	return { runtime, channel };
}

describe("ssh macOS parity", () => {
	test("parses IdentityAgent with macOS escaped spaces and tilde", () => {
		const config =
			"Host *\n  IdentityAgent ~/Library/Group\\ Containers/2BUA8C4S2C.com.1password/t/agent.sock\n";

		expect(parseIdentityAgent(config, "/Users/Test User")).toBe(
			"/Users/Test User/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock",
		);
	});

	test("discovers macOS sockets when home directory contains spaces", async () => {
		const deps = depsFor({
			readFile: async () =>
				"Host *\n  IdentityAgent ~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock\n",
			env: (name) =>
				name === "SSH_AUTH_SOCK"
					? "/Users/Test User/Library/Application Support/agent.sock"
					: undefined,
			pathExists: async (path) =>
				new Set([
					"/Users/Test User/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock",
					"/Users/Test User/Library/Application Support/agent.sock",
				]).has(path),
		});

		const sockets = await discoverAgentSockets(deps);

		expect(sockets).toEqual([
			"/Users/Test User/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock",
			"/Users/Test User/Library/Application Support/agent.sock",
		]);
	});

	test("falls back to xterm-256color when injected TERM is empty", async () => {
		const { runtime, channel } = createConsoleHarness("");
		let requestedTerm: string | undefined;

		const client: SSHClientLike = {
			exec: async () => {
				throw new Error("not used");
			},
			shell: async (options) => {
				requestedTerm = options.term;
				return channel;
			},
		};

		const openPromise = openConsole(client, {}, runtime);
		await Promise.resolve();
		channel.emit("close");
		await openPromise;

		expect(requestedTerm).toBe("xterm-256color");
	});
});
