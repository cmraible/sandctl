import { Command } from "commander";

import { getProvider, type VMStatus } from "@/provider";
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
		return `${Math.floor(remaining / (60 * 60 * 1000))}h remaining`;
	}
	return `${Math.floor(remaining / (60 * 1000))}m remaining`;
}

function formatCreatedAt(createdAt: string): string {
	const d = new Date(createdAt);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

	for (const session of sessions) {
		if (!session.provider_id) {
			if (session.status !== "stopped") {
				session.status = "stopped";
				await store.update(session.id, { status: "stopped" });
			}
			continue;
		}

		const provider = getProvider(session.provider);
		if (!provider) {
			continue;
		}

		try {
			const vm = await provider.getVM(session.provider_id);
			if (!vm) {
				if (session.status === "running" || session.status === "provisioning") {
					session.status = "stopped";
					await store.update(session.id, { status: "stopped" });
				}
				continue;
			}

			const nextStatus = mapVMStatusToSession(vm.status);
			if (
				nextStatus !== session.status ||
				(vm.ip_address && vm.ip_address !== session.ip_address)
			) {
				session.status = nextStatus;
				if (vm.ip_address) {
					session.ip_address = vm.ip_address;
				}
				await store.update(session.id, {
					status: session.status,
					ip_address: session.ip_address,
				});
			}
		} catch (error) {
			console.warn(`[warn] Failed to sync session '${session.id}': ${error}`);
		}
	}

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
