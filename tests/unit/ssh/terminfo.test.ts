import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";

import type { SSHClientLike, SSHExecChannelLike } from "@/ssh/client";
import { syncTerminfo } from "@/ssh/terminfo";

function createMockChannel(exitCode: number, stdout = ""): SSHExecChannelLike {
	const channel = new PassThrough() as SSHExecChannelLike;
	channel.stderr = new PassThrough();

	// Delay emission so listeners in exec.ts have time to attach
	setTimeout(() => {
		if (stdout) {
			channel.push(stdout);
		}
		channel.push(null);
		channel.emit("close", exitCode);
	}, 10);

	return channel;
}

function createMockClient(
	execResponses: Array<{ exitCode: number; stdout?: string }>,
): SSHClientLike {
	let callIndex = 0;
	return {
		exec: async () => {
			const response = execResponses[callIndex] ?? { exitCode: 1 };
			callIndex++;
			return createMockChannel(response.exitCode, response.stdout);
		},
		shell: async () => {
			throw new Error("not used");
		},
		sftp: async () => {
			throw new Error("not used");
		},
	};
}

describe("ssh/terminfo", () => {
	test("returns well-known TERM values without checking remote", async () => {
		const client = createMockClient([]);
		const result = await syncTerminfo(client, "xterm-256color");
		expect(result).toBe("xterm-256color");
	});

	test("returns fallback for empty TERM", async () => {
		const client = createMockClient([]);
		const result = await syncTerminfo(client, "");
		expect(result).toBe("xterm-256color");
	});

	test("returns original TERM when remote already has it", async () => {
		// First exec: infocmp check succeeds
		const client = createMockClient([{ exitCode: 0 }]);
		const result = await syncTerminfo(client, "xterm-ghostty");
		expect(result).toBe("xterm-ghostty");
	});

	test("returns fallback when remote lacks term and local infocmp fails", async () => {
		// First exec: infocmp check fails (remote doesn't have it)
		// The local infocmp will also fail since we're in a test environment
		const client = createMockClient([{ exitCode: 1 }]);
		const result = await syncTerminfo(client, "some-unknown-terminal");
		expect(result).toBe("xterm-256color");
	});
});
