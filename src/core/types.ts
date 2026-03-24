/**
 * Shared types for sandctl core.
 *
 * These types are used across core modules and by interface layers
 * (CLI, HTTP, WebSocket) that consume core functions.
 */

import type { Session } from "@/session/types";

/**
 * Callback for reporting progress during long-running operations.
 * The CLI layer maps this to spinner updates; a web layer could map
 * to SSE/WebSocket events.
 */
export type OnProgress = (message: string) => void;

/**
 * Minimal session store interface for read-only operations.
 */
export interface SessionStoreReader {
	get(id: string): Promise<Session>;
}

/**
 * Session store interface for read and write operations.
 */
export interface SessionStoreReadWriter extends SessionStoreReader {
	list(): Promise<Session[]>;
	listActive(): Promise<Session[]>;
	add(session: Session): Promise<void>;
	update(id: string, updates: Partial<Session>): Promise<void>;
	remove(id: string): Promise<void>;
	rename(oldId: string, newId: string): Promise<void>;
}
