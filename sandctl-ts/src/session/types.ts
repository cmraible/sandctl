export type Status = "provisioning" | "running" | "stopped" | "failed";

export interface Session {
	id: string;
	status: Status;
	provider: string;
	provider_id: string;
	ip_address: string;
	region?: string;
	server_type?: string;
	created_at: string;
	timeout?: string;
}

export class Duration {
	readonly milliseconds: number;

	constructor(milliseconds: number) {
		this.milliseconds = milliseconds;
	}

	static parse(value: string | number): Duration {
		if (typeof value === "number") {
			return new Duration(value);
		}

		const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
		if (!match) {
			throw new Error(`invalid duration: ${value}`);
		}

		const hours = Number.parseInt(match[1] ?? "0", 10);
		const minutes = Number.parseInt(match[2] ?? "0", 10);
		const seconds = Number.parseInt(match[3] ?? "0", 10);

		return new Duration((hours * 3600 + minutes * 60 + seconds) * 1000);
	}

	toString(): string {
		const totalSeconds = Math.floor(this.milliseconds / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		if (hours > 0) {
			return `${hours}h${minutes}m${seconds}s`;
		}
		if (minutes > 0) {
			return `${minutes}m${seconds}s`;
		}
		return `${seconds}s`;
	}

	toJSON(): string {
		return this.toString();
	}
}

export class NotFoundError extends Error {
	constructor(id: string) {
		super(`session '${id}' not found`);
		this.name = "NotFoundError";
	}
}

export function isActive(session: Session): boolean {
	return session.status === "provisioning" || session.status === "running";
}

export function isTerminal(session: Session): boolean {
	return session.status === "stopped" || session.status === "failed";
}

export function timeoutRemaining(session: Session): number | null {
	if (!session.timeout) {
		return null;
	}

	const timeoutMs = Duration.parse(session.timeout).milliseconds;
	const createdAtMs = new Date(session.created_at).getTime();
	return Math.max(0, createdAtMs + timeoutMs - Date.now());
}

export function age(session: Session): number {
	return Date.now() - new Date(session.created_at).getTime();
}
