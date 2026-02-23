import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";

import type { SSHClientLike, SSHShellChannelLike } from "@/ssh/client";
import { type ConsoleRuntime, openConsole } from "@/ssh/console";

function createHarness(opts: { rows?: number; cols?: number } = {}) {
	const stdin = new PassThrough() as ConsoleRuntime["stdin"];
	stdin.isTTY = true;
	stdin.isRaw = false;
	stdin.setRawMode = () => {};

	const stdout = new PassThrough() as ConsoleRuntime["stdout"];
	stdout.rows = opts.rows;
	stdout.columns = opts.cols;

	const stderr = new PassThrough();

	const channel = new PassThrough() as SSHShellChannelLike;
	channel.stderr = new PassThrough();

	return {
		runtime: {
			stdin,
			stdout,
			stderr,
			term: "xterm-256color",
		} satisfies ConsoleRuntime,
		channel,
	};
}

describe("ssh/console", () => {
	test("clamps resize dimensions to at least 1 before setWindow", async () => {
		const { runtime, channel } = createHarness({ rows: 0, cols: 0 });
		const setWindowCalls: Array<[number, number, number, number]> = [];
		channel.setWindow = (rows, cols, height, width) => {
			setWindowCalls.push([rows, cols, height, width]);
		};

		const client: SSHClientLike = {
			exec: async () => {
				throw new Error("not used");
			},
			shell: async () => channel,
		};

		const openPromise = openConsole(client, {}, runtime);
		await Promise.resolve();

		runtime.stdout.emit("resize");
		channel.emit("close");
		await openPromise;

		expect(setWindowCalls).toEqual([[1, 1, 0, 0]]);
	});

	test("cleans up and exits when shell channel emits error", async () => {
		const { runtime, channel } = createHarness();
		const rawModes: boolean[] = [];
		let didUnpipe = false;
		let didUnpipeStderr = false;
		runtime.stdin.setRawMode = (raw) => {
			rawModes.push(raw);
		};
		const originalUnpipe = runtime.stdin.unpipe.bind(runtime.stdin);
		runtime.stdin.unpipe = ((dest?: NodeJS.WritableStream) => {
			if (dest === channel) {
				didUnpipe = true;
			}
			return originalUnpipe(dest);
		}) as typeof runtime.stdin.unpipe;
		const originalStderrUnpipe = channel.stderr.unpipe.bind(channel.stderr);
		channel.stderr.unpipe = ((dest?: NodeJS.WritableStream) => {
			if (dest === runtime.stderr) {
				didUnpipeStderr = true;
			}
			return originalStderrUnpipe(dest);
		}) as typeof channel.stderr.unpipe;

		const client: SSHClientLike = {
			exec: async () => {
				throw new Error("not used");
			},
			shell: async () => channel,
		};

		const openPromise = openConsole(client, {}, runtime);
		await Promise.resolve();

		channel.emit("error", new Error("shell failed"));
		await expect(openPromise).rejects.toThrow("shell failed");

		expect(didUnpipe).toBe(true);
		expect(didUnpipeStderr).toBe(true);
		expect(rawModes).toEqual([true, false]);
		expect(runtime.stdout.listenerCount("resize")).toBe(0);
	});
});
