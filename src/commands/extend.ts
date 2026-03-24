import { Command } from "commander";
import { mapDomainError } from "@/commands/shared/session-runtime";
import { type ExtendResult, extendSession } from "@/core/sessions";
import { SessionStore } from "@/session/store";

export type { ExtendResult };

export async function runExtend(
	name: string,
	duration: string,
	options: { silent?: boolean },
	store = new SessionStore(),
): Promise<ExtendResult> {
	try {
		const result = await extendSession(name, duration, { store });

		if (!options.silent) {
			console.log(
				`Extended session ${result.id} by ${result.extended_by} (expires in ${result.expires_in})`,
			);
		}

		return result;
	} catch (error) {
		mapDomainError(error);
	}
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
