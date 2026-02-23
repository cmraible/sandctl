import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import type { SSHClientLike, SSHExecChannelLike } from "@/ssh/client";
import { exec } from "@/ssh/exec";

function createChannel(
	opts: { stdout?: string; stderr?: string; exitCode?: number } = {},
): SSHExecChannelLike {
	const channel = new PassThrough() as SSHExecChannelLike;
	channel.stderr = new PassThrough();

	setTimeout(() => {
		if (opts.stdout) {
			channel.write(opts.stdout);
		}
		channel.end();

		if (opts.stderr) {
			channel.stderr.write(opts.stderr);
		}
		channel.stderr.end();

		channel.emit("close", opts.exitCode ?? 0);
	}, 0);

	return channel;
}

describe("ssh/exec", () => {
	test("returns stdout, stderr, and exit code", async () => {
		const client: SSHClientLike = {
			exec: async () =>
				createChannel({ stdout: "hello\n", stderr: "warn\n", exitCode: 0 }),
			shell: async () => {
				throw new Error("not used");
			},
		};

		const result = await exec(client, "echo hello");

		expect(result).toEqual({
			stdout: "hello\n",
			stderr: "warn\n",
			exitCode: 0,
		});
	});

	test("returns non-zero exit codes without throwing", async () => {
		const client: SSHClientLike = {
			exec: async () => createChannel({ stderr: "bad\n", exitCode: 42 }),
			shell: async () => {
				throw new Error("not used");
			},
		};

		const result = await exec(client, "exit 42");

		expect(result.exitCode).toBe(42);
		expect(result.stderr).toBe("bad\n");
	});

	test("bubbles transport errors from client exec", async () => {
		const client: SSHClientLike = {
			exec: async () => {
				throw new Error("channel allocation failed");
			},
			shell: async () => {
				throw new Error("not used");
			},
		};

		await expect(exec(client, "uptime")).rejects.toThrow(
			"channel allocation failed",
		);
	});

	test("rejects when channel errors without close", async () => {
		const channel = new PassThrough() as SSHExecChannelLike;
		channel.stderr = new PassThrough();

		const client: SSHClientLike = {
			exec: async () => {
				setTimeout(() => {
					channel.emit("error", new Error("stream failed"));
				}, 0);
				return channel;
			},
			shell: async () => {
				throw new Error("not used");
			},
		};

		await expect(exec(client, "uptime")).rejects.toThrow("stream failed");
	});
});
