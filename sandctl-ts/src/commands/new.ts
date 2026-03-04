import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isatty } from "node:tty";
import { Command } from "commander";
import { createSpinner } from "nanospinner";
import {
	buildSSHOptions,
	type SSHRuntimeClient,
	withSSHClient,
} from "@/commands/shared/session-runtime";
import {
	type Config,
	getProviderConfig,
	getSSHPublicKey,
	hasGitConfig,
	load,
	type ProviderConfig,
} from "@/config/config";
import { get as getProviderFromRegistry } from "@/provider/registry";
import { generateID } from "@/session/id";
import { SessionStore } from "@/session/store";
import { Duration, type Session } from "@/session/types";
import {
	SSHClient,
	type SSHClientLike,
	type SSHClientOptions,
} from "@/ssh/client";
import { openConsole } from "@/ssh/console";
import { type ExecResult, execWithStreams } from "@/ssh/exec";
import { TemplateNotFoundError, TemplateStore } from "@/template/store";
import type { TemplateInitScript, TemplateStoreLike } from "@/template/types";
import { expandTilde } from "@/utils/paths";

const DEFAULT_PROVIDER = "hetzner";
const DEFAULT_WAIT_READY_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_CLOUD_INIT_TIMEOUT_MS = 10 * 60 * 1000;
const CLOUD_INIT_POLL_INTERVAL_MS = 5_000;

interface NewOptions {
	provider?: string;
	region?: string;
	serverType?: string;
	image?: string;
	timeout?: string;
	template?: string;
	noConsole?: boolean;
}

interface NewCommandSpinner {
	succeed(message: string): void;
	fail(message: string): void;
}

interface NewCommandDependencies {
	runNew: (options: NewOptions, configPath?: string) => Promise<Session>;
	createSpinner: (text: string) => NewCommandSpinner;
	log: (message: string) => void;
	loadConfig: (configPath?: string) => Promise<Config>;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
	openRemoteConsole: (client: SSHClientLike) => Promise<void>;
	isInteractive: () => boolean;
	warn: (message: string) => void;
}

interface SessionStoreLike {
	list(): Promise<Session[]>;
	add(session: Session): Promise<void>;
	upsert?(session: Session): Promise<void>;
}

interface Dependencies {
	loadConfig: (configPath?: string) => Promise<Config>;
	resolveProvider: (
		name: string,
		config: ProviderConfig,
	) => ReturnType<typeof getProviderFromRegistry>;
	generateSessionID: (existingNames: string[]) => string;
	getPublicKey: (config: Config) => Promise<string>;
	store: SessionStoreLike;
	templateStore: TemplateStoreLike;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
	runRemoteTemplate: (
		client: SSHClientLike,
		command: string,
		script: string,
	) => Promise<ExecResult>;
	waitForCloudInit: (
		config: Config,
		host: string,
		createClient: (options: SSHClientOptions) => SSHRuntimeClient,
		timeoutMs: number,
	) => Promise<void>;
	setupGitConfig: (
		config: Config,
		host: string,
		deps: Pick<Dependencies, "createSSHClient">,
	) => Promise<void>;
	now: () => Date;
	warn: (message: string) => void;
}

const defaultDependencies: Dependencies = {
	loadConfig: load,
	resolveProvider: getProviderFromRegistry,
	generateSessionID: generateID,
	getPublicKey: getSSHPublicKey,
	store: new SessionStore(),
	templateStore: new TemplateStore(),
	createSSHClient: (options) => new SSHClient(options),
	runRemoteTemplate: async (client, command, script) => {
		return await execWithStreams(client, command, { stdin: script });
	},
	waitForCloudInit: defaultWaitForCloudInit,
	setupGitConfig: setupGitConfigViaSSH,
	now: () => new Date(),
	warn: (message: string) => {
		console.warn(message);
	},
};

const defaultNewCommandDependencies: NewCommandDependencies = {
	runNew: async (options, configPath) => {
		return await runNew(options, {}, configPath);
	},
	createSpinner: (text) => {
		const spinner = createSpinner(text).start();
		return {
			succeed(message: string): void {
				spinner.success({ text: message });
			},
			fail(message: string): void {
				spinner.error({ text: message });
			},
		};
	},
	log: (message: string) => {
		console.log(message);
	},
	loadConfig: load,
	createSSHClient: (options) => new SSHClient(options),
	openRemoteConsole: openConsole,
	isInteractive: () => isatty(0),
	warn: (message: string) => {
		console.warn(message);
	},
};

function messageFromError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

async function persistFailedSession(
	store: SessionStoreLike,
	session: Session,
	warn: (message: string) => void,
): Promise<void> {
	try {
		if (store.upsert) {
			await store.upsert(session);
			return;
		}
		await store.add(session);
	} catch (error) {
		warn(
			`[warn] Failed to persist failed session '${session.id}': ${messageFromError(error)}`,
		);
	}
}

function waitReadyTimeoutMs(options: NewOptions): number {
	if (!options.timeout) {
		return DEFAULT_WAIT_READY_TIMEOUT_MS;
	}
	return Duration.parse(options.timeout).milliseconds;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function defaultWaitForCloudInit(
	config: Config,
	host: string,
	createClient: (options: SSHClientOptions) => SSHRuntimeClient,
	timeoutMs: number,
): Promise<void> {
	const sshOptions = { ...buildSSHOptions(config, host), username: "root" };
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const client = createClient(sshOptions);
			const done = await withSSHClient(client, async (c) => {
				const channel = await c.exec(
					"test -f /var/lib/cloud/instance/boot-finished && echo done",
				);
				return await new Promise<boolean>((resolve) => {
					let output = "";
					channel.on("data", (data: Buffer | string) => {
						output += data.toString();
					});
					channel.on("close", () => {
						resolve(output.trim() === "done");
					});
				});
			});
			if (done) {
				return;
			}
		} catch {
			// SSH not ready yet or command failed; keep polling
		}
		await sleep(CLOUD_INIT_POLL_INTERVAL_MS);
	}

	throw new Error(
		`cloud-init did not complete within ${Math.round(timeoutMs / 1000)}s`,
	);
}

export function sshKeyName(publicKey: string): string {
	const hex = createHash("md5").update(publicKey).digest("hex");
	return `sandctl-${hex.slice(0, 8)}`;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

async function setupGitConfigViaSSH(
	config: Config,
	host: string,
	deps: Pick<Dependencies, "createSSHClient">,
): Promise<void> {
	if (!hasGitConfig(config)) {
		return;
	}

	let gitConfigContent: string;
	if (config.git_config_path) {
		gitConfigContent = await readFile(
			expandTilde(config.git_config_path),
			"utf8",
		);
	} else {
		gitConfigContent = `[user]\n\tname = ${config.git_user_name}\n\temail = ${config.git_user_email}\n`;
	}

	const encoded = Buffer.from(gitConfigContent).toString("base64");

	const sshOptions = { ...buildSSHOptions(config, host), username: "root" };
	const client = deps.createSSHClient(sshOptions);

	await withSSHClient(client, async (c) => {
		const writeChannel = await c.exec(
			`echo '${encoded}' | base64 -d > /home/agent/.gitconfig`,
		);
		await collectChannelOutput(writeChannel);

		const chownChannel = await c.exec(
			"chown agent:agent /home/agent/.gitconfig && chmod 644 /home/agent/.gitconfig",
		);
		await collectChannelOutput(chownChannel);
	});
}

async function collectChannelOutput(channel: {
	on(event: string, listener: (...args: unknown[]) => void): void;
}): Promise<void> {
	return new Promise<void>((resolve) => {
		channel.on("close", () => resolve());
	});
}

async function runTemplateScript(
	config: Config,
	host: string,
	template: TemplateInitScript,
	deps: Pick<Dependencies, "createSSHClient" | "runRemoteTemplate">,
): Promise<void> {
	const client = deps.createSSHClient(buildSSHOptions(config, host));

	await withSSHClient(client, async (c) => {
		const command =
			`SANDCTL_TEMPLATE_NAME=${shellQuote(template.name)} ` +
			`SANDCTL_TEMPLATE_NORMALIZED=${shellQuote(template.normalized)} ` +
			"bash -s";
		const result = await deps.runRemoteTemplate(c, command, template.script);
		if (result.exitCode !== 0) {
			throw new Error(
				`template init script failed with exit code ${result.exitCode}`,
			);
		}
	});
}

export async function runNew(
	options: NewOptions,
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<Session> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	const config = await dependencies.loadConfig(configPath);

	let selectedTemplate: TemplateInitScript | undefined;
	if (options.template) {
		try {
			selectedTemplate = await dependencies.templateStore.getInitScript(
				options.template,
			);
		} catch (error) {
			if (error instanceof TemplateNotFoundError) {
				throw new Error(
					`template '${options.template}' not found. Use 'sandctl template list' to see available templates`,
				);
			}
			throw error;
		}
	}

	const providerName =
		options.provider ?? config.default_provider ?? DEFAULT_PROVIDER;
	const providerConfig = getProviderConfig(config, providerName);
	if (!providerConfig) {
		throw new Error(`provider '${providerName}' is not configured`);
	}

	const provider = dependencies.resolveProvider(providerName, providerConfig);
	const existingNames = (await dependencies.store.list()).map(
		(session) => session.id,
	);
	const sessionID = dependencies.generateSessionID(existingNames);
	const createdAt = dependencies.now().toISOString();

	const publicKey = await dependencies.getPublicKey(config);
	const sshKeyID = await provider.ensureSSHKey(
		sshKeyName(publicKey),
		publicKey,
	);

	let createdVM: Awaited<ReturnType<typeof provider.create>> | undefined;

	try {
		createdVM = await provider.create({
			name: sessionID,
			region: options.region,
			serverType: options.serverType,
			image: options.image,
			sshKeyIDs: [sshKeyID],
		});
		await provider.waitReady(createdVM.id, waitReadyTimeoutMs(options));

		const readyVM = await provider.get(createdVM.id);

		if (readyVM.ipAddress) {
			await dependencies.waitForCloudInit(
				config,
				readyVM.ipAddress,
				dependencies.createSSHClient,
				DEFAULT_CLOUD_INIT_TIMEOUT_MS,
			);

			try {
				await dependencies.setupGitConfig(
					config,
					readyVM.ipAddress,
					dependencies,
				);
			} catch (error) {
				dependencies.warn(
					`[warn] Git config setup failed: ${messageFromError(error)}`,
				);
			}
		}

		if (selectedTemplate && !readyVM.ipAddress) {
			throw new Error("VM has no IP address for template initialization");
		}

		if (selectedTemplate && readyVM.ipAddress) {
			await runTemplateScript(config, readyVM.ipAddress, selectedTemplate, {
				createSSHClient: dependencies.createSSHClient,
				runRemoteTemplate: dependencies.runRemoteTemplate,
			});
		}

		const session: Session = {
			id: sessionID,
			status: "running",
			provider: providerName,
			provider_id: readyVM.id,
			ip_address: readyVM.ipAddress ?? "",
			region: readyVM.region,
			server_type: readyVM.serverType,
			created_at: createdAt,
		};

		await dependencies.store.add(session);
		return session;
	} catch (error) {
		if (createdVM) {
			try {
				await provider.delete(createdVM.id);
			} catch (cleanupError) {
				dependencies.warn(
					`[warn] Failed to cleanup VM '${createdVM.id}': ${messageFromError(cleanupError)}`,
				);
			}

			await persistFailedSession(
				dependencies.store,
				{
					id: sessionID,
					status: "failed",
					provider: providerName,
					provider_id: createdVM.id,
					ip_address: createdVM.ipAddress ?? "",
					region: createdVM.region,
					server_type: createdVM.serverType,
					created_at: createdAt,
					failure_reason: messageFromError(error),
				},
				dependencies.warn,
			);
		}

		throw error;
	}
}

export async function runNewCommand(
	options: NewOptions,
	configPath?: string,
	deps: Partial<NewCommandDependencies> = {},
): Promise<Session> {
	const dependencies = {
		...defaultNewCommandDependencies,
		...deps,
	};

	const spinner = dependencies.createSpinner("Provisioning VM...");
	let session: Session;
	try {
		session = await dependencies.runNew(options, configPath);
		spinner.succeed(`Created VM '${session.id}'.`);
		dependencies.log(`VM name: ${session.id}`);
	} catch (error) {
		spinner.fail("Failed to provision VM.");
		throw error;
	}

	const shouldConsole =
		!options.noConsole && dependencies.isInteractive() && session.ip_address;

	if (shouldConsole) {
		dependencies.log("Connecting to console...");
		try {
			const config = await dependencies.loadConfig(configPath);
			const client = dependencies.createSSHClient(
				buildSSHOptions(config, session.ip_address),
			);
			await withSSHClient(client, async (c) => {
				await dependencies.openRemoteConsole(c);
			});
		} catch (error) {
			dependencies.warn(
				`Warning: Failed to connect to console: ${messageFromError(error)}`,
			);
			dependencies.log(
				`Session was created successfully. Use 'sandctl console ${session.id}' to connect manually.`,
			);
		}
	} else if (!options.noConsole) {
		dependencies.log(`Use 'sandctl console ${session.id}' to connect.`);
		dependencies.log(`Use 'sandctl destroy ${session.id}' when done.`);
	}

	return session;
}

export function registerNewCommand(): Command {
	return new Command("new")
		.description("Create a new sandboxed session")
		.option("-p, --provider <provider>", "Provider name")
		.option("-T, --template <template>", "Template to initialize the session")
		.option("--region <region>", "Region override")
		.option("--server-type <serverType>", "Server type override")
		.option("--image <image>", "Image override")
		.option("-t, --timeout <timeout>", "Wait timeout (for example: 5m, 10m)")
		.option(
			"--no-console",
			"Skip automatic console connection after provisioning",
		)
		.action(async (options: NewOptions, command) => {
			const globals = command.optsWithGlobals() as { config?: string };
			await runNewCommand(options, globals.config);
		});
}
