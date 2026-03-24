import { spawn } from "node:child_process";
import { platform } from "node:os";
import { Command } from "commander";

import { getSessionUrl } from "@/core/config";
import { mapDomainError } from "@/commands/shared/session-runtime";
import type { SessionStoreReader } from "@/core/types";
import { SessionStore } from "@/session/store";

interface OpenOptions {
	port?: string;
	https?: boolean;
}

interface Dependencies {
	store: SessionStoreReader;
	openURL: (url: string) => Promise<void>;
	log: (message: string) => void;
}

const defaultDependencies: Dependencies = {
	store: new SessionStore(),
	openURL: defaultOpenURL,
	log: (message: string) => {
		console.log(message);
	},
};

function browserCommand(): string {
	switch (platform()) {
		case "darwin":
			return "open";
		case "win32":
			return "start";
		default:
			return "xdg-open";
	}
}

async function defaultOpenURL(url: string): Promise<void> {
	const command = browserCommand();
	return new Promise((resolve, reject) => {
		const child = spawn(command, [url], { stdio: "ignore" });
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`${command} exited with code ${code}`));
			}
		});
	});
}

export async function runOpen(
	name: string,
	options: OpenOptions = {},
	deps: Partial<Dependencies> = {},
): Promise<string> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	try {
		const url = await getSessionUrl(name, options, {
			store: dependencies.store,
		});

		dependencies.log(`Opening ${url}...`);
		await dependencies.openURL(url);

		return url;
	} catch (error) {
		mapDomainError(error);
	}
}

export function registerOpenCommand(): Command {
	return new Command("open")
		.description("Open a running session in the browser")
		.argument("<name>")
		.option("-p, --port <port>", "Port number")
		.option("--https", "Use HTTPS instead of HTTP")
		.action(async (name: string, options: OpenOptions, command: Command) => {
			const globals = command.optsWithGlobals() as {
				config?: string;
				json?: boolean;
			};
			if (globals.json) {
				const url = await runOpen(name, options, {
					log: () => {},
					openURL: async () => {},
				});
				console.log(JSON.stringify({ url }, null, 2));
				return;
			}
			await runOpen(name, options);
		});
}
