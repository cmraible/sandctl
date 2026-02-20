import { Command } from "commander";
import { registerInitCommand } from "@/commands/init";
import { registerVersionCommand } from "@/commands/version";

const program = new Command()
	.name("sandctl")
	.description("Manage sandboxed AI web development agents")
	.option("--config <path>", "Config file path", "~/.sandctl/config")
	.option("-v, --verbose", "Enable verbose debug output");

program.addCommand(registerVersionCommand());
program.addCommand(registerInitCommand());
program.parse();
