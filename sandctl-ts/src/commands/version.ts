import { Command } from "commander";

import { BUILD_TIME, COMMIT, VERSION } from "@/version";

export function registerVersionCommand(): Command {
	return new Command("version")
		.description("Show version information")
		.action(() => {
			console.log(`sandctl version ${VERSION}`);
			console.log(`  commit: ${COMMIT}`);
			console.log(`  built:  ${BUILD_TIME}`);
		});
}
