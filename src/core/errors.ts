/**
 * Domain error classes for sandctl core.
 *
 * These replace CLI-specific CommandExitError with semantic error types
 * that any interface layer (CLI, HTTP, WebSocket) can map to its own
 * error representation.
 */

export class SessionNotFoundError extends Error {
	constructor(readonly sessionId: string) {
		super(
			`Session '${sessionId}' not found. Use 'sandctl list' to see available sessions.`,
		);
		this.name = "SessionNotFoundError";
	}
}

export class SessionNotReadyError extends Error {
	constructor(
		readonly sessionId: string,
		readonly reason: string,
	) {
		super(reason);
		this.name = "SessionNotReadyError";
	}
}

export class ProviderNotConfiguredError extends Error {
	constructor(readonly provider: string) {
		super(`provider '${provider}' is not configured`);
		this.name = "ProviderNotConfiguredError";
	}
}

export class ProviderDeletionError extends Error {
	constructor(
		readonly providerId: string,
		readonly details: string,
	) {
		super(`Failed to delete provider VM '${providerId}': ${details}`);
		this.name = "ProviderDeletionError";
	}
}

export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ValidationError";
	}
}
