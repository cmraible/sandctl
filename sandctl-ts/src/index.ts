import { Command } from "commander";
import { registerVersionCommand } from "@/commands/version";

const program = new Command()
	.name("sandctl")
	.description("Manage sandboxed AI web development agents")
	.option("--config <path>", "Config file path", "~/.sandctl/config")
	.option("-v, --verbose", "Enable verbose debug output");

program.addCommand(registerVersionCommand());
program.parse();
