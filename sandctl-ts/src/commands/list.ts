import { Command } from "commander";
import { DateTime } from "luxon";

import { getProvider, VMNotFoundError, type VMStatus } from "@/provider";
import { SessionStore } from "@/session/store";
import { type Session, type Status, timeoutRemaining } from "@/session/types";

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

function formatCreatedAt(createdAt: string): string {
	return DateTime.fromISO(createdAt).toLocal().toFormat("yyyy-MM-dd HH:mm:ss");
}

function outputTable(sessions: Session[]): void {
	console.log("ID       PROVIDER  STATUS   CREATED              TIMEOUT");
	for (const session of sessions) {
		const providerName = session.provider_id ? session.provider : "(legacy)";
		const cols = [
			session.id.padEnd(8),
			providerName.padEnd(9),
			session.status.padEnd(8),
			formatCreatedAt(session.created_at).padEnd(20),
			formatTimeout(timeoutRemaining(session)),
		];
		console.log(cols.join(" "));
	}
}

export async function runList(
	options: { format: string; all: boolean },
	store = new SessionStore(),
): Promise<void> {
	let sessions = (
		options.all ? await store.list() : await store.listActive()
	).map((session) => ({ ...session }));

	const updatedSessions: Session[] = [];
	for (const session of sessions) {
		const updatedSession: Session = { ...session };

		if (!updatedSession.provider_id) {
			if (updatedSession.status !== "stopped") {
				updatedSession.status = "stopped";
				await store.update(updatedSession.id, { status: "stopped" });
			}
			updatedSessions.push(updatedSession);
			continue;
		}

		let provider: ReturnType<typeof getProvider>;
		try {
			provider = getProvider(updatedSession.provider);
		} catch (error) {
			console.warn(
				`[warn] Failed to sync session '${updatedSession.id}': ${error}`,
			);
			updatedSessions.push(updatedSession);
			continue;
		}

		if (!provider) {
			updatedSessions.push(updatedSession);
			continue;
		}

		try {
			const vm = await provider.getVM(updatedSession.provider_id);
			const nextStatus = mapVMStatusToSession(vm.status);
			if (
				nextStatus !== updatedSession.status ||
				(vm.ip_address && vm.ip_address !== updatedSession.ip_address)
			) {
				updatedSession.status = nextStatus;
				if (vm.ip_address) {
					updatedSession.ip_address = vm.ip_address;
				}
				await store.update(updatedSession.id, {
					status: updatedSession.status,
					ip_address: updatedSession.ip_address,
				});
			}
		} catch (error) {
			if (error instanceof VMNotFoundError) {
				if (
					updatedSession.status === "running" ||
					updatedSession.status === "provisioning"
				) {
					updatedSession.status = "stopped";
					await store.update(updatedSession.id, { status: "stopped" });
				}
				updatedSessions.push(updatedSession);
				continue;
			}
			console.warn(
				`[warn] Failed to sync session '${updatedSession.id}': ${error}`,
			);
		}

		updatedSessions.push(updatedSession);
	}

	sessions = updatedSessions;
	if (!options.all) {
		sessions = sessions.filter(
			(session) =>
				session.status === "provisioning" || session.status === "running",
		);
	}

	if (sessions.length === 0) {
		if (options.format === "json") {
			console.log("[]");
			return;
		}
		console.log("No active sessions.");
		console.log("Use 'sandctl new' to create one.");
		return;
	}

	if (options.format === "json") {
		console.log(JSON.stringify(sessions, null, 2));
		return;
	}
	if (options.format === "table") {
		outputTable(sessions);
		return;
	}
	throw new Error(`unknown format: ${options.format} (valid: table, json)`);
}

export function registerListCommand(): Command {
	return new Command("list")
		.alias("ls")
		.description("List active sessions")
		.option(
			"-f, --format <format>",
			"Output format: table (default) or json",
			"table",
		)
		.option("-a, --all", "Include stopped and failed sessions", false)
		.action(async (options: { format: string; all: boolean }) => {
			await runList(options);
		});
}
