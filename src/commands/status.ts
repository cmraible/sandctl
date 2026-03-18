import { Command } from "commander";
import { DateTime } from "luxon";
import { formatTimeout } from "@/commands/list";
import {
	lookupSession,
	type SessionStoreLike,
} from "@/commands/shared/session-runtime";
import { SessionStore } from "@/session/store";
import { age, type Session, timeoutRemaining } from "@/session/types";

interface Dependencies {
	store: SessionStoreLike;
	log: (message: string) => void;
}

const defaultDependencies: Dependencies = {
	store: new SessionStore(),
	log: (message: string) => {
		console.log(message);
	},
};

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

function formatCreatedAt(createdAt: string): string {
	return DateTime.fromISO(createdAt).toLocal().toFormat("yyyy-MM-dd HH:mm:ss");
}

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

function buildResult(session: Session): StatusResult {
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

export async function runStatus(
	name: string,
	deps: Partial<Dependencies> = {},
): Promise<StatusResult> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	const session = await lookupSession(name, dependencies.store);
	return buildResult(session);
}

function outputTable(result: StatusResult, log: (msg: string) => void): void {
	const rows: Array<[string, string]> = [
		["ID", result.id],
		["Status", result.status],
		["Provider", result.provider],
		["Provider ID", result.provider_id],
		["IP Address", result.ip_address],
		["Region", result.region],
		["Server Type", result.server_type],
		["Created", formatCreatedAt(result.created_at)],
		["Uptime", result.uptime],
		["Timeout", result.timeout ?? "-"],
		["Remaining", result.timeout_remaining],
	];

	if (result.failure_reason) {
		rows.push(["Failure Reason", result.failure_reason]);
	}

	const labelWidth = Math.max(...rows.map(([label]) => label.length)) + 1;
	for (const [label, value] of rows) {
		log(`${`${label}:`.padEnd(labelWidth + 1)} ${value}`);
	}
}

export function registerStatusCommand(): Command {
	return new Command("status")
		.description("Show detailed information about a session")
		.argument("<name>")
		.action(async (name: string, _options: unknown, command: Command) => {
			const globals = command.optsWithGlobals() as {
				config?: string;
				json?: boolean;
			};
			const result = await runStatus(name);
			if (globals.json) {
				console.log(JSON.stringify(result, null, 2));
				return;
			}
			outputTable(result, console.log);
		});
}
