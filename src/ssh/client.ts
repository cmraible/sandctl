import { readFile } from "node:fs/promises";
import { Client } from "ssh2";

import { discoverPrimaryAgentSocket } from "@/ssh/agent";

const DEFAULT_PORT = 22;
const DEFAULT_USERNAME = "agent";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface SSHClientOptions {
	host: string;
	port?: number;
	username?: string;
	privateKeyPath?: string;
	useAgent?: boolean;
	agentSocket?: string;
	timeout?: number;
}

export interface SSHExecChannelLike extends NodeJS.ReadWriteStream {
	stderr: NodeJS.ReadableStream;
}

export interface SSHShellChannelLike extends SSHExecChannelLike {
	setWindow(rows: number, cols: number, height: number, width: number): void;
}

export interface SFTPStats {
	isDirectory(): boolean;
	isFile(): boolean;
	size: number;
}

export interface SFTPFileEntry {
	filename: string;
	attrs: SFTPStats;
}

export interface SFTPWrapperLike {
	fastPut(
		localPath: string,
		remotePath: string,
		options: { step?: (total: number, nb: number, fsize: number) => void },
		callback: (err?: Error | null) => void,
	): void;
	fastGet(
		remotePath: string,
		localPath: string,
		options: { step?: (total: number, nb: number, fsize: number) => void },
		callback: (err?: Error | null) => void,
	): void;
	readdir(
		path: string,
		callback: (err: Error | undefined, list: SFTPFileEntry[]) => void,
	): void;
	stat(
		path: string,
		callback: (err: Error | undefined, stats: SFTPStats) => void,
	): void;
	mkdir(path: string, callback: (err?: Error | null) => void): void;
	end(): void;
}

export interface SSHConnectionLike {
	connect(config: Record<string, unknown>): void;
	on(event: string, listener: (...args: unknown[]) => void): SSHConnectionLike;
	once(
		event: string,
		listener: (...args: unknown[]) => void,
	): SSHConnectionLike;
	exec(
		command: string,
		callback: (error?: Error, channel?: SSHExecChannelLike) => void,
	): void;
	shell(
		window: { term: string; cols: number; rows: number },
		callback: (error?: Error, channel?: SSHShellChannelLike) => void,
	): void;
	sftp(callback: (error?: Error, sftp?: SFTPWrapperLike) => void): void;
	forwardOut(
		srcIP: string,
		srcPort: number,
		dstIP: string,
		dstPort: number,
		callback: (error?: Error, channel?: NodeJS.ReadWriteStream) => void,
	): void;
	end(): void;
}

export interface SSHClientDeps {
	createConnection(): SSHConnectionLike;
	discoverAgentSocket(): Promise<string | undefined>;
	readPrivateKey(path: string): Promise<string>;
}

const defaultDeps: SSHClientDeps = {
	createConnection: () => new Client() as unknown as SSHConnectionLike,
	discoverAgentSocket: () => discoverPrimaryAgentSocket(),
	readPrivateKey: (path) => readFile(path, "utf8"),
};

export interface SSHClientLike {
	exec(command: string): Promise<SSHExecChannelLike>;
	shell(opts?: {
		term?: string;
		cols?: number;
		rows?: number;
	}): Promise<SSHShellChannelLike>;
	sftp(): Promise<SFTPWrapperLike>;
	forwardOut(
		srcIP: string,
		srcPort: number,
		dstIP: string,
		dstPort: number,
	): Promise<NodeJS.ReadWriteStream>;
}

export class SSHClient implements SSHClientLike {
	private readonly connection: SSHConnectionLike;
	private connected = false;

	constructor(
		private readonly options: SSHClientOptions,
		private readonly deps: SSHClientDeps = defaultDeps,
	) {
		this.connection = deps.createConnection();
		this.connection.on("close", () => {
			this.connected = false;
		});
		this.connection.on("error", () => {
			this.connected = false;
		});
	}

	async connect(): Promise<void> {
		if (this.connected) {
			return;
		}

		const config: Record<string, unknown> = {
			host: this.options.host,
			port: this.options.port ?? DEFAULT_PORT,
			username: this.options.username ?? DEFAULT_USERNAME,
			readyTimeout: this.options.timeout ?? DEFAULT_TIMEOUT_MS,
		};

		if (this.options.useAgent) {
			const socket =
				this.options.agentSocket ?? (await this.deps.discoverAgentSocket());
			if (socket) {
				config.agent = socket;
				config.agentForward = true;
			}
		}

		if (!config.agent && this.options.privateKeyPath) {
			config.privateKey = await this.deps.readPrivateKey(
				this.options.privateKeyPath,
			);
		}

		if (!config.agent && !config.privateKey) {
			throw new Error(
				"no SSH authentication method configured; provide privateKeyPath or useAgent",
			);
		}

		await new Promise<void>((resolve, reject) => {
			this.connection.once("ready", () => {
				this.connected = true;
				resolve();
			});
			this.connection.once("error", (error) => {
				reject(error instanceof Error ? error : new Error(String(error)));
			});
			this.connection.connect(config);
		});
	}

	async close(): Promise<void> {
		this.connection.end();
		this.connected = false;
	}

	async exec(command: string): Promise<SSHExecChannelLike> {
		if (!this.connected) {
			throw new Error("ssh client is not connected");
		}

		return await new Promise<SSHExecChannelLike>((resolve, reject) => {
			this.connection.exec(command, (error, channel) => {
				if (error || !channel) {
					reject(error ?? new Error("failed to open exec channel"));
					return;
				}
				resolve(channel);
			});
		});
	}

	async shell(opts?: {
		term?: string;
		cols?: number;
		rows?: number;
	}): Promise<SSHShellChannelLike> {
		if (!this.connected) {
			throw new Error("ssh client is not connected");
		}

		const request = {
			term: opts?.term ?? process.env.TERM ?? "xterm-256color",
			cols: opts?.cols ?? process.stdout.columns ?? 80,
			rows: opts?.rows ?? process.stdout.rows ?? 24,
		};

		return await new Promise<SSHShellChannelLike>((resolve, reject) => {
			this.connection.shell(request, (error, channel) => {
				if (error || !channel) {
					reject(error ?? new Error("failed to open shell channel"));
					return;
				}
				resolve(channel);
			});
		});
	}

	async forwardOut(
		srcIP: string,
		srcPort: number,
		dstIP: string,
		dstPort: number,
	): Promise<NodeJS.ReadWriteStream> {
		if (!this.connected) {
			throw new Error("ssh client is not connected");
		}

		return await new Promise<NodeJS.ReadWriteStream>((resolve, reject) => {
			this.connection.forwardOut(
				srcIP,
				srcPort,
				dstIP,
				dstPort,
				(error, channel) => {
					if (error || !channel) {
						reject(error ?? new Error("failed to open forwarding channel"));
						return;
					}
					resolve(channel);
				},
			);
		});
	}

	async sftp(): Promise<SFTPWrapperLike> {
		if (!this.connected) {
			throw new Error("ssh client is not connected");
		}

		return await new Promise<SFTPWrapperLike>((resolve, reject) => {
			this.connection.sftp((error, sftp) => {
				if (error || !sftp) {
					reject(error ?? new Error("failed to open sftp session"));
					return;
				}
				resolve(sftp);
			});
		});
	}
}
