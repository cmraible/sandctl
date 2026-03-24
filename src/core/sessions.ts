/**
 * Core session operations — pure business logic, no CLI dependencies.
 *
 * These functions return typed results and throw domain errors. They accept
 * dependency-injected collaborators for testability. No console.log, no
 * spinners, no interactive prompts, no process.exitCode.
 */

import { DateTime } from "luxon";

import {
	type Config,
	getProviderConfig,
	type ProviderConfig,
} from "@/config/config";
import type { VMStatus } from "@/provider";
import type { Provider } from "@/provider/interface";
import type { VM } from "@/provider/types";
import { normalizeName, validateID } from "@/session/id";
import type { Session, Status } from "@/session/types";
import {
	age,
	Duration,
	isActive,
	NotFoundError,
	timeoutRemaining,
} from "@/session/types";

import {
	ProviderDeletionError,
	SessionNotFoundError,
	SessionNotReadyError,
	ValidationError,
} from "./errors";
import type { SessionStoreReader, SessionStoreReadWriter } from "./types";

// ---------------------------------------------------------------------------
// Session resolution — shared by all commands
// ---------------------------------------------------------------------------

/**
 * Normalise `name`, validate its format, look it up in the store, and return
 * the session. Throws domain errors (SessionNotFoundError, ValidationError).
 */
export async function resolveSession(
	name: string,
	store: SessionStoreReader,
): Promise<Session> {
	const normalized = normalizeName(name);
	if (!validateID(normalized)) {
		throw new ValidationError(`invalid session name format: ${name}`);
	}

	try {
		return await store.get(normalized);
	} catch (error) {
		if (error instanceof NotFoundError) {
			throw new SessionNotFoundError(normalized);
		}
		throw error;
	}
}

/**
 * Asserts that a session is running and has an IP address.
 * Throws `SessionNotReadyError` otherwise.
 */
export function assertRunnable(session: Session): void {
	if (session.status !== "running") {
		throw new SessionNotReadyError(
			session.id,
			`Session '${session.id}' is not running (status: ${session.status}).`,
		);
	}
	if (!session.ip_address) {
		throw new SessionNotReadyError(
			session.id,
			`Session '${session.id}' has no IP address.`,
		);
	}
}

// ---------------------------------------------------------------------------
// Formatting helpers (shared across result builders)
// ---------------------------------------------------------------------------

function assertNever(value: never): never {
	throw new Error(`unknown VM status: ${String(value)}`);
}

function mapVMStatusToSession(status: VMStatus): Status {
	switch (status) {
		case "running":
			return "running";
		case "provisioning":
		case "starting":
			return "provisioning";
		case "stopped":
		case "stopping":
		case "deleting":
			return "stopped";
		case "failed":
			return "failed";
	}
	return assertNever(status);
}

export function formatTimeout(remaining: number | null): string {
	if (remaining === null) {
		return "-";
	}
	if (remaining <= 0) {
		return "expired";
	}
	if (remaining >= 60 * 60 * 1000) {
		const hours = Math.floor(remaining / (60 * 60 * 1000));
		const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
		if (minutes > 0) {
			return `${hours}h${minutes}m remaining`;
		}
		return `${hours}h remaining`;
	}
	return `${Math.floor(remaining / (60 * 1000))}m remaining`;
}

function formatAge(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		const remainingHours = hours % 24;
		return remainingHours > 0 ? `${days}d${remainingHours}h` : `${days}d`;
	}
	if (hours > 0) {
		const remainingMinutes = minutes % 60;
		return remainingMinutes > 0 ? `${hours}h${remainingMinutes}m` : `${hours}h`;
	}
	if (minutes > 0) {
		return `${minutes}m`;
	}
	return `${seconds}s`;
}

export function formatCreatedAt(createdAt: string): string {
	return DateTime.fromISO(createdAt).toLocal().toFormat("yyyy-MM-dd HH:mm:ss");
}

// ---------------------------------------------------------------------------
// listSessions
// ---------------------------------------------------------------------------

interface ListSessionsDeps {
	store: SessionStoreReadWriter;
	loadConfig?: (configPath?: string) => Promise<Config>;
	resolveProvider?: (name: string, config: ProviderConfig) => Provider;
	warn?: (message: string) => void;
}

/**
 * List sessions, optionally syncing with providers.
 * Returns the session list — no output formatting.
 */
export async function listSessions(
	options: { all: boolean; sync?: boolean },
	deps: ListSessionsDeps,
	_configPath?: string,
): Promise<Session[]> {
	let sessions = (
		options.all ? await deps.store.list() : await deps.store.listActive()
	).map((session) => ({ ...session }));

	// Mark legacy sessions as stopped
	for (const session of sessions) {
		if (!session.provider_id && session.status !== "stopped") {
			session.status = "stopped";
			await deps.store.update(session.id, { status: "stopped" });
		}
	}

	if (options.sync) {
		await syncProviderSessions(sessions, deps);
	}

	if (!options.all) {
		sessions = sessions.filter(
			(session) =>
				session.status === "provisioning" || session.status === "running",
		);
	}

	return sessions;
}

async function syncProviderSessions(
	sessions: Session[],
	deps: ListSessionsDeps,
): Promise<void> {
	const providerNames = [
		...new Set(
			sessions
				.filter((session) => session.provider_id)
				.map((session) => session.provider),
		),
	];

	if (providerNames.length === 0) {
		return;
	}

	const warn = deps.warn ?? (() => {});
	const loadConfig = deps.loadConfig;
	const resolveProvider = deps.resolveProvider;

	if (!loadConfig || !resolveProvider) {
		return;
	}

	let config: Config;
	try {
		config = await loadConfig();
	} catch (error) {
		warn(`Failed to load config for provider sync: ${String(error)}`);
		return;
	}

	for (const providerName of providerNames) {
		const providerConfig = getProviderConfig(config, providerName);
		if (!providerConfig) {
			warn(
				`[warn] Failed to sync provider '${providerName}': provider is not configured`,
			);
			continue;
		}

		const providerSessions = sessions.filter(
			(session) => session.provider === providerName && session.provider_id,
		);

		let providerVMs: VM[];
		try {
			const provider = resolveProvider(providerName, providerConfig);
			providerVMs = await provider.list();
		} catch (error) {
			warn(
				`[warn] Failed to sync provider '${providerName}': ${String(error)}`,
			);
			continue;
		}

		const vmByID = new Map(providerVMs.map((vm) => [vm.id, vm]));

		for (const session of providerSessions) {
			const vm = vmByID.get(session.provider_id);
			if (!vm) {
				if (session.status === "running" || session.status === "provisioning") {
					session.status = "stopped";
					await deps.store.update(session.id, { status: "stopped" });
				}
				continue;
			}

			const nextStatus = mapVMStatusToSession(vm.status);
			const nextIP = vm.ipAddress ?? session.ip_address;
			if (nextStatus !== session.status || nextIP !== session.ip_address) {
				session.status = nextStatus;
				session.ip_address = nextIP;
				await deps.store.update(session.id, {
					status: session.status,
					ip_address: session.ip_address,
				});
			}
		}
	}
}

// ---------------------------------------------------------------------------
// getSessionStatus
// ---------------------------------------------------------------------------

export interface StatusResult {
	id: string;
	status: string;
	provider: string;
	provider_id: string;
	ip_address: string;
	region: string;
	server_type: string;
	created_at: string;
	uptime: string;
	timeout: string | null;
	timeout_remaining: string;
	failure_reason: string | null;
}

/**
 * Get the status of a single session.
 * Throws `SessionNotFoundError` if the session doesn't exist.
 */
export async function getSessionStatus(
	name: string,
	deps: { store: SessionStoreReader },
): Promise<StatusResult> {
	const session = await resolveSession(name, deps.store);
	return buildStatusResult(session);
}

function buildStatusResult(session: Session): StatusResult {
	const remaining = timeoutRemaining(session);
	return {
		id: session.id,
		status: session.status,
		provider: session.provider,
		provider_id: session.provider_id,
		ip_address: session.ip_address || "-",
		region: session.region ?? "-",
		server_type: session.server_type ?? "-",
		created_at: session.created_at,
		uptime: formatAge(age(session)),
		timeout: session.timeout ?? null,
		timeout_remaining: formatTimeout(remaining),
		failure_reason: session.failure_reason ?? null,
	};
}

// ---------------------------------------------------------------------------
// destroySession
// ---------------------------------------------------------------------------

export interface DestroyResult {
	id: string;
	destroyed: boolean;
}

interface DestroyDeps {
	store: SessionStoreReader & { remove(id: string): Promise<void> };
	loadConfig: (configPath?: string) => Promise<Config>;
	resolveProvider: (name: string, config: ProviderConfig) => Provider;
	resolveLegacyProvider: (
		name: string,
	) => { deleteVM(id: string): Promise<void> } | undefined;
	warn?: (message: string) => void;
}

/**
 * Destroy a session — delete the provider VM and remove local state.
 *
 * Does NOT prompt for confirmation. The caller is responsible for
 * confirming with the user before calling this function.
 *
 * Throws `SessionNotFoundError` if session not found.
 * Throws `ValidationError` for legacy sessions when force is false.
 * Throws `ProviderDeletionError` when provider deletion fails.
 */
export async function destroySession(
	name: string,
	options: { force: boolean },
	deps: DestroyDeps,
	configPath?: string,
): Promise<DestroyResult> {
	const warn = deps.warn ?? (() => {});
	const session = await resolveSession(name, deps.store);

	if (!session.provider_id) {
		if (!options.force) {
			throw new ValidationError(
				`Session '${session.id}' is in legacy format. Re-run with --force to remove local state only.`,
			);
		}
		await deps.store.remove(session.id);
		return { id: session.id, destroyed: true };
	}

	let deleteError: unknown;
	let deletionAttempted = false;

	try {
		const config = await deps.loadConfig(configPath);
		const providerConfig = getProviderConfig(config, session.provider);
		if (providerConfig) {
			const provider = deps.resolveProvider(session.provider, providerConfig);
			await provider.delete(session.provider_id);
			deletionAttempted = true;
		}
	} catch (error) {
		deleteError = error;
	}

	if (!deletionAttempted) {
		const legacyProvider = deps.resolveLegacyProvider(session.provider);
		if (legacyProvider) {
			try {
				await legacyProvider.deleteVM(session.provider_id);
				deletionAttempted = true;
			} catch (error) {
				deleteError = error;
			}
		}
	}

	if (!deletionAttempted) {
		const details = deleteError
			? deleteError instanceof Error
				? deleteError.message
				: String(deleteError)
			: `provider '${session.provider}' is not configured`;
		warn(
			`[warn] Failed to delete provider VM '${session.provider_id}': ${details}`,
		);
		throw new ProviderDeletionError(session.provider_id, details);
	}

	await deps.store.remove(session.id);
	return { id: session.id, destroyed: true };
}

// ---------------------------------------------------------------------------
// renameSession
// ---------------------------------------------------------------------------

export interface RenameResult {
	old_id: string;
	new_id: string;
}

interface RenameStoreLike {
	get: (id: string) => Promise<{
		id: string;
		provider: string;
		provider_id: string;
	}>;
	rename: (oldId: string, newId: string) => Promise<void>;
}

interface RenameDeps {
	store: RenameStoreLike;
	loadConfig: (configPath?: string) => Promise<Config>;
	resolveProvider: (name: string, config: ProviderConfig) => Provider;
}

interface ProviderWithClient {
	client: {
		updateServer: (id: string, updates: { name: string }) => Promise<unknown>;
	};
}

/**
 * Rename a session — update local state and best-effort provider rename.
 * Throws `SessionNotFoundError` if session not found.
 * Throws `ValidationError` for invalid names.
 */
export async function renameSession(
	oldName: string,
	newName: string,
	deps: RenameDeps,
	configPath?: string,
): Promise<RenameResult> {
	const normalizedOld = normalizeName(oldName);
	const normalizedNew = normalizeName(newName);

	if (!validateID(normalizedOld)) {
		throw new ValidationError(`invalid session name format: ${oldName}`);
	}
	if (!validateID(normalizedNew)) {
		throw new ValidationError(`invalid session name format: ${newName}`);
	}
	if (normalizedOld === normalizedNew) {
		throw new ValidationError("new name is the same as the current name");
	}

	const session = await deps.store
		.get(normalizedOld)
		.catch((error: unknown) => {
			if (error instanceof NotFoundError) {
				throw new SessionNotFoundError(normalizedOld);
			}
			throw error;
		});

	// Rename on the provider (best-effort)
	if (session.provider_id) {
		try {
			const config = await deps.loadConfig(configPath);
			const providerConfig = getProviderConfig(config, session.provider);
			if (providerConfig) {
				const provider = deps.resolveProvider(
					session.provider,
					providerConfig,
				) as unknown as ProviderWithClient;
				await provider.client.updateServer(session.provider_id, {
					name: normalizedNew,
				});
			}
		} catch {
			// Provider rename is best-effort — local rename still proceeds
		}
	}

	await deps.store.rename(normalizedOld, normalizedNew);

	return { old_id: normalizedOld, new_id: normalizedNew };
}

// ---------------------------------------------------------------------------
// extendSession
// ---------------------------------------------------------------------------

export interface ExtendResult {
	id: string;
	timeout: string;
	expires_in: string;
	extended_by: string;
}

interface ExtendStoreLike {
	get(id: string): Promise<Session>;
	update(id: string, updates: Partial<Session>): Promise<void>;
}

/**
 * Extend the timeout of an active session.
 * Throws `SessionNotFoundError` if session not found.
 * Throws `ValidationError` if the session is not active.
 */
export async function extendSession(
	name: string,
	duration: string,
	deps: { store: ExtendStoreLike },
): Promise<ExtendResult> {
	const normalized = normalizeName(name);
	if (!validateID(normalized)) {
		throw new ValidationError(`invalid session name format: ${name}`);
	}

	const extension = Duration.parse(duration);

	const session = await deps.store.get(normalized).catch((error: unknown) => {
		if (error instanceof NotFoundError) {
			throw new SessionNotFoundError(normalized);
		}
		throw error;
	});

	if (!isActive(session)) {
		throw new ValidationError(
			`Session '${normalized}' is ${session.status}. Only active sessions can be extended.`,
		);
	}

	let newTimeout: Duration;
	if (session.timeout) {
		const currentTimeout = Duration.parse(session.timeout);
		newTimeout = new Duration(
			currentTimeout.milliseconds + extension.milliseconds,
		);
	} else {
		const sessionAge = age(session);
		newTimeout = new Duration(sessionAge + extension.milliseconds);
	}

	await deps.store.update(normalized, { timeout: newTimeout.toString() });

	const updated = await deps.store.get(normalized);
	const remaining = timeoutRemaining(updated);
	const expiresIn =
		remaining !== null ? new Duration(remaining).toString() : duration;

	return {
		id: normalized,
		timeout: newTimeout.toString(),
		expires_in: expiresIn,
		extended_by: extension.toString(),
	};
}
