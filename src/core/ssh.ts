/**
 * Core SSH operations — pure business logic, no CLI dependencies.
 *
 * These functions handle remote command execution, file transfer, and log
 * retrieval without any CLI-specific I/O (no process.exitCode, no direct
 * stdout/stderr writes).
 */

import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import type { Config } from "@/config/config";
import {
	buildSSHOptions,
	type SFTPWrapperLike,
	type SSHClientLike,
	type SSHClientOptions,
	type SSHRuntimeClient,
	withSSHClient,
} from "@/ssh/client";
import type { ExecResult } from "@/ssh/exec";

import { assertRunnable, resolveSession } from "./sessions";
import type { SessionStoreReader } from "./types";

// ---------------------------------------------------------------------------
// execCommand
// ---------------------------------------------------------------------------

interface ExecDeps {
	store: SessionStoreReader;
	loadConfig: (configPath?: string) => Promise<Config>;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
	runRemoteCommand: (
		client: SSHClientLike,
		command: string,
	) => Promise<ExecResult>;
}

/**
 * Execute a command on a remote session.
 * Returns the ExecResult with stdout, stderr, and exitCode.
 *
 * Throws `SessionNotFoundError` or `SessionNotReadyError` on lookup failure.
 */
export async function execCommand(
	name: string,
	command: string,
	deps: ExecDeps,
	configPath?: string,
): Promise<ExecResult> {
	const session = await resolveSession(name, deps.store);
	assertRunnable(session);

	const config = await deps.loadConfig(configPath);
	const client = deps.createSSHClient(
		buildSSHOptions(config, session.ip_address),
	);

	return withSSHClient(client, async (c) => {
		if (command.trim().length === 0) {
			throw new Error("command cannot be empty or whitespace");
		}
		return await deps.runRemoteCommand(c, command);
	});
}

// ---------------------------------------------------------------------------
// getLogs
// ---------------------------------------------------------------------------

const LOG_FILE = "/var/log/cloud-init-output.log";

interface LogsDeps {
	store: SessionStoreReader;
	loadConfig: (configPath?: string) => Promise<Config>;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
	runCommand: (client: SSHClientLike, command: string) => Promise<ExecResult>;
	runStreamingCommand: (
		client: SSHClientLike,
		command: string,
		options: {
			onStdout?: (data: string) => void;
			onStderr?: (data: string) => void;
		},
	) => Promise<ExecResult>;
}

interface LogsOptions {
	follow?: boolean;
	lines?: string;
	onStdout?: (data: string) => void;
	onStderr?: (data: string) => void;
}

function buildLogCommand(options: LogsOptions): string {
	if (options.follow) {
		const lines = options.lines ?? "10";
		return `tail -n ${lines} -f ${LOG_FILE}`;
	}
	if (options.lines) {
		return `tail -n ${options.lines} ${LOG_FILE}`;
	}
	return `cat ${LOG_FILE}`;
}

/**
 * Retrieve cloud-init logs from a session.
 * Returns the ExecResult with log content.
 *
 * Throws `SessionNotFoundError` or `SessionNotReadyError` on lookup failure.
 */
export async function getLogs(
	name: string,
	options: LogsOptions,
	deps: LogsDeps,
	configPath?: string,
): Promise<ExecResult> {
	const session = await resolveSession(name, deps.store);
	assertRunnable(session);

	const config = await deps.loadConfig(configPath);
	const client = deps.createSSHClient(
		buildSSHOptions(config, session.ip_address),
	);

	const command = buildLogCommand(options);

	return withSSHClient(client, async (c) => {
		if (options.follow) {
			return await deps.runStreamingCommand(c, command, {
				onStdout: options.onStdout,
				onStderr: options.onStderr,
			});
		}

		return await deps.runCommand(c, command);
	});
}

// ---------------------------------------------------------------------------
// copyFiles — SFTP transfer helpers
// ---------------------------------------------------------------------------

interface RemoteTarget {
	session: string;
	path: string;
}

type CpTarget =
	| { kind: "local"; path: string }
	| { kind: "remote"; session: string; path: string };

export function parseTarget(arg: string): CpTarget {
	const colonIndex = arg.indexOf(":");
	if (colonIndex <= 0) {
		return { kind: "local", path: arg };
	}
	return {
		kind: "remote",
		session: arg.slice(0, colonIndex),
		path: arg.slice(colonIndex + 1),
	};
}

export function resolveDirection(
	source: CpTarget,
	destination: CpTarget,
):
	| { direction: "upload"; local: string; remote: RemoteTarget }
	| { direction: "download"; remote: RemoteTarget; local: string } {
	if (source.kind === "local" && destination.kind === "remote") {
		return {
			direction: "upload",
			local: source.path,
			remote: { session: destination.session, path: destination.path },
		};
	}
	if (source.kind === "remote" && destination.kind === "local") {
		return {
			direction: "download",
			remote: { session: source.session, path: source.path },
			local: destination.path,
		};
	}
	if (source.kind === "remote" && destination.kind === "remote") {
		throw new Error(
			"Remote-to-remote copy is not supported. Copy to local first, then upload.",
		);
	}
	throw new Error(
		"Both source and destination are local. Use session:path syntax for the remote side.",
	);
}

// SFTP helpers

function sftpFastPut(
	sftp: SFTPWrapperLike,
	localPath: string,
	remotePath: string,
	onStep?: (total: number, nb: number, fsize: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		sftp.fastPut(localPath, remotePath, { step: onStep }, (err) => {
			if (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
				return;
			}
			resolve();
		});
	});
}

function sftpFastGet(
	sftp: SFTPWrapperLike,
	remotePath: string,
	localPath: string,
	onStep?: (total: number, nb: number, fsize: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		sftp.fastGet(remotePath, localPath, { step: onStep }, (err) => {
			if (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
				return;
			}
			resolve();
		});
	});
}

function sftpMkdir(sftp: SFTPWrapperLike, path: string): Promise<void> {
	return new Promise((resolve, reject) => {
		sftp.mkdir(path, (err) => {
			if (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
				return;
			}
			resolve();
		});
	});
}

function sftpStat(
	sftp: SFTPWrapperLike,
	path: string,
): Promise<{ isDirectory: boolean; size: number }> {
	return new Promise((resolve, reject) => {
		sftp.stat(path, (err, stats) => {
			if (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
				return;
			}
			resolve({ isDirectory: stats.isDirectory(), size: stats.size });
		});
	});
}

function sftpReaddir(
	sftp: SFTPWrapperLike,
	path: string,
): Promise<Array<{ filename: string; isDirectory: boolean }>> {
	return new Promise((resolve, reject) => {
		sftp.readdir(path, (err, list) => {
			if (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
				return;
			}
			resolve(
				list.map((entry) => ({
					filename: entry.filename,
					isDirectory: entry.attrs.isDirectory(),
				})),
			);
		});
	});
}

async function sftpMkdirRecursive(
	sftp: SFTPWrapperLike,
	dirPath: string,
): Promise<void> {
	const parts = dirPath.split("/").filter(Boolean);
	let current = dirPath.startsWith("/") ? "/" : "";
	for (const part of parts) {
		current = current ? posix.join(current, part) : part;
		try {
			await sftpMkdir(sftp, current);
		} catch {
			// directory may already exist
		}
	}
}

export interface TransferResult {
	filesTransferred: number;
	bytesTransferred: number;
}

async function uploadFile(
	sftp: SFTPWrapperLike,
	localPath: string,
	remotePath: string,
): Promise<TransferResult> {
	let bytesTransferred = 0;
	await sftpFastPut(sftp, localPath, remotePath, (total, _nb, _fsize) => {
		bytesTransferred = total;
	});
	return { filesTransferred: 1, bytesTransferred };
}

async function uploadDirectory(
	sftp: SFTPWrapperLike,
	localPath: string,
	remotePath: string,
): Promise<TransferResult> {
	let filesTransferred = 0;
	let bytesTransferred = 0;

	await sftpMkdirRecursive(sftp, remotePath);

	const entries = await readdir(localPath, { withFileTypes: true });
	for (const entry of entries) {
		const localChild = join(localPath, entry.name);
		const remoteChild = posix.join(remotePath, entry.name);

		if (entry.isDirectory()) {
			const sub = await uploadDirectory(sftp, localChild, remoteChild);
			filesTransferred += sub.filesTransferred;
			bytesTransferred += sub.bytesTransferred;
		} else if (entry.isFile()) {
			const sub = await uploadFile(sftp, localChild, remoteChild);
			filesTransferred += sub.filesTransferred;
			bytesTransferred += sub.bytesTransferred;
		}
	}

	return { filesTransferred, bytesTransferred };
}

async function downloadFile(
	sftp: SFTPWrapperLike,
	remotePath: string,
	localPath: string,
): Promise<TransferResult> {
	await mkdir(dirname(localPath), { recursive: true });
	let bytesTransferred = 0;
	await sftpFastGet(sftp, remotePath, localPath, (total, _nb, _fsize) => {
		bytesTransferred = total;
	});
	return { filesTransferred: 1, bytesTransferred };
}

async function downloadDirectory(
	sftp: SFTPWrapperLike,
	remotePath: string,
	localPath: string,
): Promise<TransferResult> {
	let filesTransferred = 0;
	let bytesTransferred = 0;

	await mkdir(localPath, { recursive: true });

	const entries = await sftpReaddir(sftp, remotePath);
	for (const entry of entries) {
		if (entry.filename === "." || entry.filename === "..") {
			continue;
		}

		const remoteChild = posix.join(remotePath, entry.filename);
		const localChild = join(localPath, entry.filename);

		if (entry.isDirectory) {
			const sub = await downloadDirectory(sftp, remoteChild, localChild);
			filesTransferred += sub.filesTransferred;
			bytesTransferred += sub.bytesTransferred;
		} else {
			const sub = await downloadFile(sftp, remoteChild, localChild);
			filesTransferred += sub.filesTransferred;
			bytesTransferred += sub.bytesTransferred;
		}
	}

	return { filesTransferred, bytesTransferred };
}

export interface CpDeps {
	store: SessionStoreReader;
	loadConfig: (configPath?: string) => Promise<Config>;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
	openSFTP: (client: SSHClientLike) => Promise<SFTPWrapperLike>;
	localStat: (path: string) => Promise<{ isDirectory: boolean }>;
	remoteStat: (
		sftp: SFTPWrapperLike,
		path: string,
	) => Promise<{ isDirectory: boolean; size: number }>;
	uploadFile: (
		sftp: SFTPWrapperLike,
		localPath: string,
		remotePath: string,
	) => Promise<TransferResult>;
	uploadDirectory: (
		sftp: SFTPWrapperLike,
		localPath: string,
		remotePath: string,
	) => Promise<TransferResult>;
	downloadFile: (
		sftp: SFTPWrapperLike,
		remotePath: string,
		localPath: string,
	) => Promise<TransferResult>;
	downloadDirectory: (
		sftp: SFTPWrapperLike,
		remotePath: string,
		localPath: string,
	) => Promise<TransferResult>;
}

export const defaultCpDeps: CpDeps = {
	store: undefined as never, // Must be provided
	loadConfig: undefined as never, // Must be provided
	createSSHClient: undefined as never, // Must be provided
	openSFTP: (client) => client.sftp(),
	localStat: async (path) => {
		const s = await stat(path);
		return { isDirectory: s.isDirectory() };
	},
	remoteStat: sftpStat,
	uploadFile,
	uploadDirectory,
	downloadFile,
	downloadDirectory,
};

interface CpOptions {
	recursive?: boolean;
}

/**
 * Copy files between local and remote session via SFTP.
 * Returns transfer statistics.
 *
 * Throws `SessionNotFoundError` or `SessionNotReadyError` on lookup failure.
 */
export async function copyFiles(
	source: string,
	destination: string,
	options: CpOptions,
	deps: CpDeps,
	configPath?: string,
): Promise<TransferResult> {
	const src = parseTarget(source);
	const dst = parseTarget(destination);
	const plan = resolveDirection(src, dst);

	const session = await resolveSession(plan.remote.session, deps.store);
	assertRunnable(session);

	const config = await deps.loadConfig(configPath);
	const client = deps.createSSHClient(
		buildSSHOptions(config, session.ip_address),
	);

	return withSSHClient(client, async (c) => {
		const sftp = await deps.openSFTP(c);

		try {
			if (plan.direction === "upload") {
				const localInfo = await deps.localStat(plan.local);

				if (localInfo.isDirectory) {
					if (!options.recursive) {
						throw new Error(
							`'${plan.local}' is a directory. Use -r to copy directories.`,
						);
					}
					return await deps.uploadDirectory(sftp, plan.local, plan.remote.path);
				}
				return await deps.uploadFile(sftp, plan.local, plan.remote.path);
			}

			// download
			let remoteIsDir: boolean;
			try {
				const remoteInfo = await deps.remoteStat(sftp, plan.remote.path);
				remoteIsDir = remoteInfo.isDirectory;
			} catch {
				throw new Error(`Remote path '${plan.remote.path}' not found.`);
			}

			if (remoteIsDir) {
				if (!options.recursive) {
					throw new Error(
						`'${plan.remote.path}' is a directory. Use -r to copy directories.`,
					);
				}
				return await deps.downloadDirectory(sftp, plan.remote.path, plan.local);
			}
			return await deps.downloadFile(sftp, plan.remote.path, plan.local);
		} finally {
			sftp.end();
		}
	});
}
