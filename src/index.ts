import { Command } from "commander";

import { registerConsoleCommand } from "@/commands/console";
import { registerDestroyCommand } from "@/commands/destroy";
import { registerExecCommand } from "@/commands/exec";
import { registerInitCommand } from "@/commands/init";
import { registerListCommand } from "@/commands/list";
import { registerNewCommand } from "@/commands/new";
import { registerTemplateCommand } from "@/commands/template";
import { registerVersionCommand } from "@/commands/version";

const program = new Command()
	.name("sandctl")
	.description("Manage sandboxed AI web development agents")
	.option("--config <path>", "Config file path", "~/.sandctl/config")
	.option("-v, --verbose", "Enable verbose debug output")
	.option("--json", "Output results as JSON");

program.addCommand(registerVersionCommand());
program.addCommand(registerInitCommand());
program.addCommand(registerNewCommand());
program.addCommand(registerListCommand());
program.addCommand(registerExecCommand());
program.addCommand(registerConsoleCommand());
program.addCommand(registerDestroyCommand());
program.addCommand(registerTemplateCommand());

if (import.meta.main) {
	program.parseAsync().catch((error: unknown) => {
		if (
			error &&
			typeof error === "object" &&
			"exitCode" in error &&
			typeof error.exitCode === "number"
		) {
			const message =
				"message" in error ? String(error.message) : String(error);
			console.error(message);
			process.exitCode = error.exitCode;
			return;
		}

		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
