import { stat } from "node:fs/promises";
import { Command } from "commander";

import {
	copyFiles,
	defaultCpDeps,
	parseTarget,
	resolveDirection,
	type TransferResult,
	type CpDeps,
} from "@/core/ssh";
import {
	mapDomainError,
	type SSHRuntimeClient,
} from "@/commands/shared/session-runtime";
import type { SessionStoreReader } from "@/core/types";
import { type Config, load } from "@/config/config";
import { SessionStore } from "@/session/store";
import {
	type SFTPWrapperLike,
	SSHClient,
	type SSHClientLike,
	type SSHClientOptions,
} from "@/ssh/client";

export { parseTarget, resolveDirection, type TransferResult, type CpDeps };

const defaultDependencies: CpDeps = {
	...defaultCpDeps,
	store: new SessionStore(),
	loadConfig: load,
	createSSHClient: (options) => new SSHClient(options),
};

interface CpOptions {
	recursive?: boolean;
}

export async function runCp(
	source: string,
	destination: string,
	options: CpOptions,
	deps: Partial<CpDeps> = {},
	configPath?: string,
): Promise<TransferResult> {
	const d = { ...defaultDependencies, ...deps };

	try {
		return await copyFiles(source, destination, options, d, configPath);
	} catch (error) {
		mapDomainError(error);
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function registerCpCommand(): Command {
	return new Command("cp")
		.description("Copy files between local machine and a sandbox session")
		.argument("<source>", "Source path (local or session:/remote/path)")
		.argument(
			"<destination>",
			"Destination path (local or session:/remote/path)",
		)
		.option("-r, --recursive", "Copy directories recursively")
		.action(
			async (
				source: string,
				destination: string,
				options: CpOptions,
				command: Command,
			): Promise<void> => {
				const globals = command.optsWithGlobals() as {
					config?: string;
					json?: boolean;
				};

				const result = await runCp(
					source,
					destination,
					options,
					{},
					globals.config,
				);

				if (globals.json) {
					console.log(
						JSON.stringify(
							{
								files_transferred: result.filesTransferred,
								bytes_transferred: result.bytesTransferred,
							},
							null,
							2,
						),
					);
				} else {
					console.log(
						`Transferred ${result.filesTransferred} file${result.filesTransferred === 1 ? "" : "s"} (${formatBytes(result.bytesTransferred)})`,
					);
				}
			},
		);
}
