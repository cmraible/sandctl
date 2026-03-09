import { Socket } from "node:net";

import type { SSHClientLike, SSHExecChannelLike } from "@/ssh/client";

const DEFAULT_SSH_PORT = 22;
const DEFAULT_TIMEOUT_MS = 2_000;

export interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export async function exec(
	client: SSHClientLike,
	command: string,
): Promise<ExecResult> {
	const channel = await client.exec(command);
	return await collectExecResult(channel);
}

export async function execWithStreams(
	client: SSHClientLike,
	command: string,
	options?: { stdin?: string },
): Promise<ExecResult> {
	const channel = await client.exec(command);
	if (options?.stdin !== undefined) {
		channel.write(options.stdin);
	}
	channel.end();
	return await collectExecResult(channel);
}

export async function checkConnection(
	host: string,
	port = DEFAULT_SSH_PORT,
	timeout = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
	if (timeout <= 0) {
		return false;
	}

	return await new Promise<boolean>((resolve) => {
		const socket = new Socket();
		let settled = false;

		const done = (result: boolean): void => {
			if (settled) {
				return;
			}
			settled = true;
			socket.destroy();
			resolve(result);
		};

		socket.once("connect", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
		socket.setTimeout(timeout);
		socket.connect(port, host);
	});
}

export async function execWithStreamingOutput(
	client: SSHClientLike,
	command: string,
	options: {
		stdin?: string;
		onStdout?: (data: string) => void;
		onStderr?: (data: string) => void;
	},
): Promise<ExecResult> {
	const channel = await client.exec(command);
	if (options.stdin !== undefined) {
		channel.write(options.stdin);
	}
	channel.end();

	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];

	const exitCode = await new Promise<number>((resolve, reject) => {
		const onStdoutData = (chunk: string | Buffer): void => {
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			stdoutChunks.push(buf);
			options.onStdout?.(buf.toString("utf8"));
		};
		const onStderrData = (chunk: string | Buffer): void => {
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			stderrChunks.push(buf);
			options.onStderr?.(buf.toString("utf8"));
		};
		const toError = (error: unknown): Error => {
			return error instanceof Error ? error : new Error(String(error));
		};
		const cleanup = (): void => {
			channel.removeListener("data", onStdoutData);
			channel.stderr.removeListener("data", onStderrData);
			channel.removeListener("close", onClose);
			channel.removeListener("error", onError);
			channel.stderr.removeListener("error", onError);
		};
		const onClose = (code?: number): void => {
			cleanup();
			resolve(typeof code === "number" ? code : 0);
		};
		const onError = (error: unknown): void => {
			cleanup();
			reject(toError(error));
		};

		channel.on("data", onStdoutData);
		channel.stderr.on("data", onStderrData);
		channel.once("close", onClose);
		channel.once("error", onError);
		channel.stderr.once("error", onError);
	});

	return {
		stdout: Buffer.concat(stdoutChunks).toString("utf8"),
		stderr: Buffer.concat(stderrChunks).toString("utf8"),
		exitCode,
	};
}

async function collectExecResult(
	channel: SSHExecChannelLike,
): Promise<ExecResult> {
	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];

	const exitCode = await new Promise<number>((resolve, reject) => {
		const onStdoutData = (chunk: string | Buffer): void => {
			stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		};
		const onStderrData = (chunk: string | Buffer): void => {
			stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		};
		const toError = (error: unknown): Error => {
			return error instanceof Error ? error : new Error(String(error));
		};
		const cleanup = (): void => {
			channel.removeListener("data", onStdoutData);
			channel.stderr.removeListener("data", onStderrData);
			channel.removeListener("close", onClose);
			channel.removeListener("error", onError);
			channel.stderr.removeListener("error", onError);
		};
		const onClose = (code?: number): void => {
			cleanup();
			resolve(typeof code === "number" ? code : 0);
		};
		const onError = (error: unknown): void => {
			cleanup();
			reject(toError(error));
		};

		channel.on("data", onStdoutData);
		channel.stderr.on("data", onStderrData);
		channel.once("close", onClose);
		channel.once("error", onError);
		channel.stderr.once("error", onError);
	});

	return {
		stdout: Buffer.concat(stdoutChunks).toString("utf8"),
		stderr: Buffer.concat(stderrChunks).toString("utf8"),
		exitCode,
	};
}
