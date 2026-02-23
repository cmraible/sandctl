import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import AsyncLock from "async-lock";
import { z } from "zod";

import { normalizeName } from "@/session/id";
import { isActive, NotFoundError, type Session } from "@/session/types";

const statusSchema = z.enum(["provisioning", "running", "stopped", "failed"]);
const sessionInputSchema = z.object({
	id: z.string(),
	status: statusSchema,
	provider: z.string().optional(),
	provider_id: z.string().optional(),
	ip_address: z.string().optional(),
	failure_reason: z.string().optional(),
	region: z.string().optional(),
	server_type: z.string().optional(),
	created_at: z.string(),
	timeout: z.string().optional(),
});
const fileSchema = z.union([
	z.array(sessionInputSchema),
	z.object({ sessions: z.array(sessionInputSchema) }),
]);

function normalizeSession(input: z.infer<typeof sessionInputSchema>): Session {
	return {
		...input,
		provider: input.provider ?? "",
		provider_id: input.provider_id ?? "",
		ip_address: input.ip_address ?? "",
	};
}

function formatValidationError(error: z.ZodError): string {
	const maxIssues = 5;
	const issues = error.issues.slice(0, maxIssues).map((issue) => {
		const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
		return `${path}: ${issue.message}`;
	});
	const remainder = error.issues.length - issues.length;
	const suffix = remainder > 0 ? ` (+${remainder} more)` : "";
	return `${issues.join("; ")}${suffix}`;
}

export function defaultStorePath(): string {
	return join(homedir(), ".sandctl", "sessions.json");
}

export class SessionStore {
	private readonly lock = new AsyncLock();

	constructor(private readonly path = defaultStorePath()) {}

	private async load(): Promise<Session[]> {
		try {
			await access(this.path);
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return [];
			}
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`failed to access sessions file: ${message}`);
		}

		const raw = await readFile(this.path, "utf8");
		if (raw.trim() === "") {
			return [];
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw) as unknown;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`failed to parse sessions file: ${message}`);
		}
		const validated = fileSchema.safeParse(parsed);
		if (!validated.success) {
			throw new Error(
				`invalid sessions file structure: ${formatValidationError(validated.error)}`,
			);
		}

		const sessions = Array.isArray(validated.data)
			? validated.data
			: validated.data.sessions;
		return sessions.map(normalizeSession);
	}

	private async save(sessions: Session[]): Promise<void> {
		await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
		await writeFile(this.path, `${JSON.stringify(sessions, null, 2)}\n`, {
			mode: 0o600,
		});
	}

	async add(session: Session): Promise<void> {
		await this.lock.acquire("sessions", async () => {
			const sessions = await this.load();
			const normalized = normalizeName(session.id);
			if (
				sessions.some((existing) => normalizeName(existing.id) === normalized)
			) {
				throw new Error(`session with name '${session.id}' already exists`);
			}

			sessions.push({ ...session, id: normalized });
			await this.save(sessions);
		});
	}

	async update(id: string, updates: Partial<Session>): Promise<void> {
		await this.lock.acquire("sessions", async () => {
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
		});
	}

	async upsert(session: Session): Promise<void> {
		await this.lock.acquire("sessions", async () => {
			const sessions = await this.load();
			const normalized = normalizeName(session.id);
			const next = { ...session, id: normalized };
			const index = sessions.findIndex(
				(existing) => normalizeName(existing.id) === normalized,
			);
			if (index === -1) {
				sessions.push(next);
			} else {
				sessions[index] = { ...sessions[index], ...next };
			}
			await this.save(sessions);
		});
	}

	async remove(id: string): Promise<void> {
		await this.lock.acquire("sessions", async () => {
			const sessions = await this.load();
			const normalized = normalizeName(id);
			const filtered = sessions.filter(
				(session) => normalizeName(session.id) !== normalized,
			);
			if (filtered.length === sessions.length) {
				throw new NotFoundError(id);
			}

			await this.save(filtered);
		});
	}

	async get(id: string): Promise<Session> {
		return this.lock.acquire("sessions", async () => {
			const sessions = await this.load();
			const normalized = normalizeName(id);
			const session = sessions.find(
				(current) => normalizeName(current.id) === normalized,
			);
			if (!session) {
				throw new NotFoundError(id);
			}
			return session;
		});
	}

	async list(): Promise<Session[]> {
		return this.lock.acquire("sessions", async () => this.load());
	}

	async listActive(): Promise<Session[]> {
		return this.lock.acquire("sessions", async () => {
			const sessions = await this.load();
			return sessions.filter((session) => isActive(session));
		});
	}
}
