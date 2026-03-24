/**
 * CLI-specific session runtime helpers.
 *
 * These wrap core helpers with CLI error handling (CommandExitError with
 * exit codes). Core modules should import from @/core/* and @/ssh/client
 * instead.
 */

import {
	SessionNotFoundError,
	SessionNotReadyError,
	ValidationError,
} from "@/core/errors";
import {
	assertRunnable as coreAssertRunnable,
	resolveSession as coreResolveSession,
} from "@/core/sessions";
import type { SessionStoreReader } from "@/core/types";
import type { Session } from "@/session/types";

// Re-export SSH helpers from their canonical location
export {
	buildSSHOptions,
	type SSHRuntimeClient,
	withSSHClient,
} from "@/ssh/client";

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
// Session store interface (re-exported for backward compat)
// ---------------------------------------------------------------------------

export type SessionStoreLike = SessionStoreReader;

// ---------------------------------------------------------------------------
// mapDomainError — maps core domain errors to CommandExitError
// ---------------------------------------------------------------------------

/**
 * Converts domain errors from core into CLI-specific CommandExitErrors.
 * Rethrows unknown errors unchanged.
 */
export function mapDomainError(error: unknown): never {
	if (error instanceof SessionNotFoundError) {
		throw new CommandExitError(error.message, EXIT_SESSION_NOT_FOUND);
	}
	if (error instanceof SessionNotReadyError) {
		throw new CommandExitError(error.message, EXIT_SESSION_NOT_READY);
	}
	if (error instanceof ValidationError) {
		throw new Error(error.message);
	}
	throw error;
}

// ---------------------------------------------------------------------------
// Session lookup (CLI wrapper around core resolveSession)
// ---------------------------------------------------------------------------

/**
 * Normalise `name`, validate its format, look it up in the store, and return
 * the session. Converts domain errors into CLI-specific CommandExitErrors.
 */
export async function lookupSession(
	name: string,
	store: SessionStoreReader,
): Promise<Session> {
	try {
		return await coreResolveSession(name, store);
	} catch (error) {
		mapDomainError(error);
	}
}

// ---------------------------------------------------------------------------
// Running-status validation (CLI wrapper around core assertRunnable)
// ---------------------------------------------------------------------------

/**
 * Asserts that a session is running and has an IP address. Throws
 * `CommandExitError(5)` otherwise.
 */
export function assertRunnable(session: Session): void {
	try {
		coreAssertRunnable(session);
	} catch (error) {
		mapDomainError(error);
	}
}
