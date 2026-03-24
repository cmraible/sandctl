import { Command } from "commander";
import { mapDomainError } from "@/commands/shared/session-runtime";
import {
	formatCreatedAt,
	getSessionStatus,
	type StatusResult,
} from "@/core/sessions";
import type { SessionStoreReader } from "@/core/types";
import { SessionStore } from "@/session/store";

export type { StatusResult };

interface Dependencies {
	store: SessionStoreReader;
	log: (message: string) => void;
}

const defaultDependencies: Dependencies = {
	store: new SessionStore(),
	log: (message: string) => {
		console.log(message);
	},
};

export async function runStatus(
	name: string,
	deps: Partial<Dependencies> = {},
): Promise<StatusResult> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	try {
		return await getSessionStatus(name, { store: dependencies.store });
	} catch (error) {
		mapDomainError(error);
	}
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
