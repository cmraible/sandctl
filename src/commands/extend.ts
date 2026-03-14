import { Command } from "commander";

import { normalizeName, validateID } from "@/session/id";
import { SessionStore } from "@/session/store";
import {
	age,
	Duration,
	isActive,
	NotFoundError,
	timeoutRemaining,
} from "@/session/types";

export interface ExtendResult {
	id: string;
	timeout: string;
	expires_in: string;
}

export async function runExtend(
	name: string,
	duration: string,
	options: { silent?: boolean },
	store = new SessionStore(),
): Promise<ExtendResult> {
	const normalized = normalizeName(name);
	if (!validateID(normalized)) {
		throw new Error(`invalid session name format: ${name}`);
	}

	const extension = Duration.parse(duration);

	const session = await store.get(normalized).catch((error: unknown) => {
		if (error instanceof NotFoundError) {
			throw new Error(
				`Session '${normalized}' not found. Use 'sandctl list' to see available sessions.`,
			);
		}
		throw error;
	});

	if (!isActive(session)) {
		throw new Error(
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
		// No timeout set — set it to session age + requested duration
		const sessionAge = age(session);
		newTimeout = new Duration(sessionAge + extension.milliseconds);
	}

	await store.update(normalized, { timeout: newTimeout.toString() });

	const updated = await store.get(normalized);
	const remaining = timeoutRemaining(updated);
	const expiresIn =
		remaining !== null ? new Duration(remaining).toString() : duration;

	if (!options.silent) {
		console.log(
			`Extended session ${normalized} by ${extension.toString()} (expires in ${expiresIn})`,
		);
	}

	return {
		id: normalized,
		timeout: newTimeout.toString(),
		expires_in: expiresIn,
	};
}

export function registerExtendCommand(): Command {
	return new Command("extend")
		.description("Extend the timeout of an active session")
		.argument("<name>", "Session name")
		.argument("<duration>", 'Duration to add (e.g. "1h", "30m", "1h30m")')
		.action(
			async (
				name: string,
				duration: string,
				_options: unknown,
				command: Command,
			) => {
				const globals = command.optsWithGlobals() as {
					config?: string;
					json?: boolean;
				};
				const result = await runExtend(name, duration, {
					silent: globals.json,
				});
				if (globals.json) {
					console.log(JSON.stringify(result, null, 2));
				}
			},
		);
}
