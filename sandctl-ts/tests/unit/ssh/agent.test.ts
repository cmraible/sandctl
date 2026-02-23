import { describe, expect, test } from "bun:test";

import { type AgentDiscoveryDeps, discoverAgentSockets } from "@/ssh/agent";

function depsFor(
	overrides: Partial<AgentDiscoveryDeps> = {},
): AgentDiscoveryDeps {
	return {
		homeDir: () => "/home/tester",
		readFile: async () => "",
		env: () => undefined,
		pathExists: async () => false,
		...overrides,
	};
}

describe("ssh/agent", () => {
	test("discovers sockets in priority order", async () => {
		const socketsThatExist = new Set([
			"/home/tester/.ssh/from-config.sock",
			"/home/tester/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock",
			"/home/tester/.1password/agent.sock",
			"/tmp/system-agent.sock",
		]);

		const deps = depsFor({
			readFile: async () =>
				'Host *\n  IdentityAgent "~/.ssh/from-config.sock"\n',
			env: (name) =>
				name === "SSH_AUTH_SOCK" ? "/tmp/system-agent.sock" : undefined,
			pathExists: async (path) => socketsThatExist.has(path),
		});

		const sockets = await discoverAgentSockets(deps);

		expect(sockets).toEqual([
			"/home/tester/.ssh/from-config.sock",
			"/home/tester/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock",
			"/home/tester/.1password/agent.sock",
			"/tmp/system-agent.sock",
		]);
	});

	test("parses tab-separated host and identityagent directives", async () => {
		const tabSocket = "/home/tester/.ssh/tab.sock";
		const deps = depsFor({
			readFile: async () => "Host\t*\n\tIdentityAgent\t~/.ssh/tab.sock\n",
			pathExists: async (path) => path === tabSocket,
		});

		const sockets = await discoverAgentSockets(deps);

		expect(sockets).toEqual([tabSocket]);
	});

	test("matches wildcard in multi-pattern host lines", async () => {
		const wildcardSocket = "/home/tester/.ssh/wildcard.sock";
		const deps = depsFor({
			readFile: async () =>
				"Host foo *\n  IdentityAgent ~/.ssh/wildcard.sock\n",
			pathExists: async (path) => path === wildcardSocket,
		});

		const sockets = await discoverAgentSockets(deps);

		expect(sockets).toEqual([wildcardSocket]);
	});

	test("deduplicates repeated sockets across sources", async () => {
		const shared = "/tmp/shared-agent.sock";
		const deps = depsFor({
			readFile: async () => `IdentityAgent ${shared}\n`,
			env: () => shared,
			pathExists: async (path) => path === shared,
		});

		const sockets = await discoverAgentSockets(deps);

		expect(sockets).toEqual([shared]);
	});
});
