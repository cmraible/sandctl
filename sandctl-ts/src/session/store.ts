import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { normalizeName } from "@/session/id";
import { isActive, NotFoundError, type Session } from "@/session/types";

export function defaultStorePath(): string {
	return join(homedir(), ".sandctl", "sessions.json");
}

export class SessionStore {
	constructor(private readonly path = defaultStorePath()) {}

	private async load(): Promise<Session[]> {
		try {
			await access(this.path);
		} catch {
			return [];
		}

		const raw = await readFile(this.path, "utf8");
		if (raw.trim() === "") {
			return [];
		}

		const parsed = JSON.parse(raw) as unknown;
		if (Array.isArray(parsed)) {
			return parsed as Session[];
		}
		if (
			parsed &&
			typeof parsed === "object" &&
			"sessions" in parsed &&
			Array.isArray((parsed as { sessions: unknown }).sessions)
		) {
			return (parsed as { sessions: Session[] }).sessions;
		}

		throw new Error("invalid sessions file format");
	}

	private async save(sessions: Session[]): Promise<void> {
		await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
		await writeFile(this.path, `${JSON.stringify(sessions, null, 2)}\n`, {
			mode: 0o600,
		});
	}

	async add(session: Session): Promise<void> {
		const sessions = await this.load();
		const normalized = normalizeName(session.id);
		if (
			sessions.some((existing) => normalizeName(existing.id) === normalized)
		) {
			throw new Error(`session with name '${session.id}' already exists`);
		}

		sessions.push({ ...session, id: normalized });
		await this.save(sessions);
	}

	async update(id: string, updates: Partial<Session>): Promise<void> {
		const sessions = await this.load();
		const normalized = normalizeName(id);
		const index = sessions.findIndex(
			(session) => normalizeName(session.id) === normalized,
		);
		if (index === -1) {
			throw new NotFoundError(id);
		}

		sessions[index] = { ...sessions[index], ...updates };
		await this.save(sessions);
	}

	async remove(id: string): Promise<void> {
		const sessions = await this.load();
		const normalized = normalizeName(id);
		const filtered = sessions.filter(
			(session) => normalizeName(session.id) !== normalized,
		);
		if (filtered.length === sessions.length) {
			throw new NotFoundError(id);
		}

		await this.save(filtered);
	}

	async get(id: string): Promise<Session> {
		const sessions = await this.load();
		const normalized = normalizeName(id);
		const session = sessions.find(
			(current) => normalizeName(current.id) === normalized,
		);
		if (!session) {
			throw new NotFoundError(id);
		}
		return session;
	}

	async list(): Promise<Session[]> {
		return this.load();
	}

	async listActive(): Promise<Session[]> {
		const sessions = await this.load();
		return sessions.filter((session) => isActive(session));
	}
}
