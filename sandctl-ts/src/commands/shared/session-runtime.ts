import type { Config } from "@/config/config";
import { normalizeName, validateID } from "@/session/id";
import { NotFoundError, type Session } from "@/session/types";
import type { SSHClientLike, SSHClientOptions } from "@/ssh/client";
import { expandTilde } from "@/utils/paths";

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

const EXIT_SESSION_NOT_FOUND = 4;
const EXIT_SESSION_NOT_READY = 5;

// ---------------------------------------------------------------------------
// CommandExitError
// ---------------------------------------------------------------------------

export class CommandExitError extends Error {
	constructor(
		message: string,
		readonly exitCode: number,
	) {
		super(message);
		this.name = "CommandExitError";
	}
}

// ---------------------------------------------------------------------------
// Session lookup
// ---------------------------------------------------------------------------

export interface SessionStoreLike {
	get(id: string): Promise<Session>;
}

/**
 * Normalise `name`, validate its format, look it up in the store, and return
 * the session.  Converts `NotFoundError` into a `CommandExitError(4)`.
 */
export async function lookupSession(
	name: string,
	store: SessionStoreLike,
): Promise<Session> {
	const normalized = normalizeName(name);
	if (!validateID(normalized)) {
		throw new Error(`invalid session name format: ${name}`);
	}

	return store.get(normalized).catch((error: unknown) => {
		if (error instanceof NotFoundError) {
			throw new CommandExitError(
				`Session '${normalized}' not found. Use 'sandctl list' to see available sessions.`,
				EXIT_SESSION_NOT_FOUND,
			);
		}
		throw error;
	});
}

// ---------------------------------------------------------------------------
// Running-status validation
// ---------------------------------------------------------------------------

/**
 * Asserts that a session is running and has an IP address.  Throws
 * `CommandExitError(5)` otherwise.
 */
export function assertRunnable(session: Session): void {
	if (session.status !== "running") {
		throw new CommandExitError(
			`Session '${session.id}' is not running (status: ${session.status}).`,
			EXIT_SESSION_NOT_READY,
		);
	}
	if (!session.ip_address) {
		throw new CommandExitError(
			`Session '${session.id}' has no IP address.`,
			EXIT_SESSION_NOT_READY,
		);
	}
}

// ---------------------------------------------------------------------------
// SSH options builder
// ---------------------------------------------------------------------------

/**
 * Builds `SSHClientOptions` from a config and a target host address.
 */
export function buildSSHOptions(
	config: Config,
	host: string,
): SSHClientOptions {
	if (config.ssh_key_source === "agent") {
		return {
			host,
			username: "agent",
			useAgent: true,
		};
	}

	if (!config.ssh_public_key) {
		throw new Error("ssh_public_key not configured");
	}

	const publicKeyPath = expandTilde(config.ssh_public_key);
	const privateKeyPath = publicKeyPath.endsWith(".pub")
		? publicKeyPath.slice(0, -4)
		: publicKeyPath;

	return {
		host,
		username: "agent",
		privateKeyPath,
	};
}

// ---------------------------------------------------------------------------
// SSH lifecycle helper
// ---------------------------------------------------------------------------

export interface SSHRuntimeClient extends SSHClientLike {
	connect(): Promise<void>;
	close(): Promise<void>;
}

/**
 * Connects `client`, runs `fn(client)`, then always closes `client`.
 *
 * Guarantees `close()` is called even when `connect()` or `fn` throw.
 */
export async function withSSHClient<T>(
	client: SSHRuntimeClient,
	fn: (client: SSHRuntimeClient) => Promise<T>,
): Promise<T> {
	try {
		await client.connect();
	} catch (error) {
		await client.close();
		throw error;
	}

	try {
		return await fn(client);
	} finally {
		await client.close();
	}
}
