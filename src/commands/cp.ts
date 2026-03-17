import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { Command } from "commander";
import {
	assertRunnable,
	buildSSHOptions,
	lookupSession,
	type SessionStoreLike,
	type SSHRuntimeClient,
	withSSHClient,
} from "@/commands/shared/session-runtime";
import { type Config, load } from "@/config/config";
import { SessionStore } from "@/session/store";
import {
	type SFTPWrapperLike,
	SSHClient,
	type SSHClientLike,
	type SSHClientOptions,
} from "@/ssh/client";

// ---------------------------------------------------------------------------
// Argument parsing
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

// ---------------------------------------------------------------------------
// SFTP helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Transfer result
// ---------------------------------------------------------------------------

export interface TransferResult {
	filesTransferred: number;
	bytesTransferred: number;
}

// ---------------------------------------------------------------------------
// Upload (local → remote)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Download (remote → local)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Core cp logic
// ---------------------------------------------------------------------------

interface CpOptions {
	recursive?: boolean;
}

interface WritableLike {
	write(chunk: string | Uint8Array): boolean;
}

export interface CpDependencies {
	store: SessionStoreLike;
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
	stdout: WritableLike;
	stderr: WritableLike;
}

const defaultDependencies: CpDependencies = {
	store: new SessionStore(),
	loadConfig: load,
	createSSHClient: (options) => new SSHClient(options),
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
	stdout: process.stdout,
	stderr: process.stderr,
};

export async function runCp(
	source: string,
	destination: string,
	options: CpOptions,
	deps: Partial<CpDependencies> = {},
	configPath?: string,
): Promise<TransferResult> {
	const d = { ...defaultDependencies, ...deps };

	const src = parseTarget(source);
	const dst = parseTarget(destination);
	const plan = resolveDirection(src, dst);

	const session = await lookupSession(plan.remote.session, d.store);
	assertRunnable(session);

	const config = await d.loadConfig(configPath);
	const client = d.createSSHClient(buildSSHOptions(config, session.ip_address));

	return withSSHClient(client, async (c) => {
		const sftp = await d.openSFTP(c);

		try {
			if (plan.direction === "upload") {
				const localInfo = await d.localStat(plan.local);

				if (localInfo.isDirectory) {
					if (!options.recursive) {
						throw new Error(
							`'${plan.local}' is a directory. Use -r to copy directories.`,
						);
					}
					return await d.uploadDirectory(sftp, plan.local, plan.remote.path);
				}
				return await d.uploadFile(sftp, plan.local, plan.remote.path);
			}

			// download
			let remoteIsDir: boolean;
			try {
				const remoteInfo = await d.remoteStat(sftp, plan.remote.path);
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
				return await d.downloadDirectory(sftp, plan.remote.path, plan.local);
			}
			return await d.downloadFile(sftp, plan.remote.path, plan.local);
		} finally {
			sftp.end();
		}
	});
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function registerCpCommand(): Command {
	return new Command("cp")
		.description("Copy files between local machine and a sandbox session")
		.argument("<source>", "Source path (local or session:/remote/path)")
		.argument(
			"<destination>",
			"Destination path (local or session:/remote/path)",
		)
		.option("-r, --recursive", "Copy directories recursively")
		.action(
			async (
				source: string,
				destination: string,
				options: CpOptions,
				command: Command,
			): Promise<void> => {
				const globals = command.optsWithGlobals() as {
					config?: string;
					json?: boolean;
				};

				const result = await runCp(
					source,
					destination,
					options,
					{},
					globals.config,
				);

				if (globals.json) {
					console.log(
						JSON.stringify(
							{
								files_transferred: result.filesTransferred,
								bytes_transferred: result.bytesTransferred,
							},
							null,
							2,
						),
					);
				} else {
					console.log(
						`Transferred ${result.filesTransferred} file${result.filesTransferred === 1 ? "" : "s"} (${formatBytes(result.bytesTransferred)})`,
					);
				}
			},
		);
}
