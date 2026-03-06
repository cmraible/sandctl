import { Command } from "commander";

import { BUILD_TIME, COMMIT, VERSION } from "@/version";

export function registerVersionCommand(): Command {
	return new Command("version")
		.description("Show version information")
		.action((_options, command) => {
			const globals = command.optsWithGlobals() as { json?: boolean };
			if (globals.json) {
				console.log(
					JSON.stringify(
						{ version: VERSION, commit: COMMIT, build_time: BUILD_TIME },
						null,
						2,
					),
				);
				return;
			}
			console.log(`sandctl version ${VERSION}`);
			console.log(`  commit: ${COMMIT}`);
			console.log(`  built:  ${BUILD_TIME}`);
		});
}
