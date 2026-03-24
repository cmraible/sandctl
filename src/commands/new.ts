import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
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
	hasClaudeConfig,
	hasClaudeOAuthToken,
	hasGitConfig,
	load,
	type ProviderConfig,
} from "@/config/config";
import type { HetznerImage } from "@/hetzner/client";
import { HetznerProvider } from "@/hetzner/provider";
import {
	assembleUserData,
	generateCloudInit,
	generatePostSnapshotSSHSetup,
} from "@/hetzner/setup";
import {
	cleanupOldSnapshots,
	createBaseSnapshot,
	findBaseSnapshot,
	type SnapshotClientLike,
} from "@/hetzner/snapshots";
import { get as getProviderFromRegistry } from "@/provider/registry";
import { resolveSize, sizesHelpText } from "@/provider/sizes";
import { generateID, normalizeName, validateID } from "@/session/id";
import { SessionStore } from "@/session/store";
import { Duration, type Session } from "@/session/types";
import {
	SSHClient,
	type SSHClientLike,
	type SSHClientOptions,
} from "@/ssh/client";
import { type ConsoleOptions, openConsole } from "@/ssh/console";
import { exec as sshExec } from "@/ssh/exec";
import { normalizeTemplateName } from "@/template/normalize";
import { TemplateNotFoundError, TemplateStore } from "@/template/store";
import type { TemplateStoreLike } from "@/template/types";
import { expandTilde } from "@/utils/paths";

const DEFAULT_PROVIDER = "hetzner";
const DEFAULT_WAIT_READY_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_CLOUD_INIT_TIMEOUT_MS = 10 * 60 * 1000;
const CLOUD_INIT_POLL_INTERVAL_MS = 5_000;

interface NewOptions {
	name?: string;
	provider?: string;
	region?: string;
	size?: string;
	serverType?: string;
	image?: string;
	timeout?: string;
	template?: string;
	noConsole?: boolean;
}

interface NewCommandSpinner {
	succeed(message: string): void;
	fail(message: string): void;
	update(message: string): void;
}

interface NewCommandDependencies {
	runNew: (
		options: NewOptions,
		configPath?: string,
		callbacks?: {
			onProgress?: (message: string) => void;
		},
	) => Promise<Session>;
	createSpinner: (text: string) => NewCommandSpinner;
	log: (message: string) => void;
	loadConfig: (configPath?: string) => Promise<Config>;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
	openRemoteConsole: (
		client: SSHClientLike,
		options?: ConsoleOptions,
	) => Promise<void>;
	isInteractive: () => boolean;
	warn: (message: string) => void;
}

interface SessionStoreLike {
	list(): Promise<Session[]>;
	add(session: Session): Promise<void>;
	update(id: string, updates: Partial<Session>): Promise<void>;
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
	findSnapshot: (
		client: SnapshotClientLike,
		userData: string,
	) => Promise<HetznerImage | null>;
	createSnapshot: (
		client: SnapshotClientLike,
		serverId: string,
		userData: string,
	) => Promise<HetznerImage>;
	cleanupSnapshots: (
		client: SnapshotClientLike,
		userData: string,
	) => Promise<void>;
	runSSHSetup: (
		config: Config,
		host: string,
		command: string,
		createClient: (options: SSHClientOptions) => SSHRuntimeClient,
	) => Promise<void>;
	setupClaudeConfig: (
		config: Config,
		host: string,
		deps: Pick<Dependencies, "createSSHClient">,
	) => Promise<void>;
	now: () => Date;
	warn: (message: string) => void;
	log: (message: string) => void;
}

const defaultDependencies: Dependencies = {
	loadConfig: load,
	resolveProvider: getProviderFromRegistry,
	generateSessionID: generateID,
	getPublicKey: getSSHPublicKey,
	store: new SessionStore(),
	templateStore: new TemplateStore(),
	createSSHClient: (options) => new SSHClient(options),
	waitForCloudInit: defaultWaitForCloudInit,
	setupGitConfig: setupGitConfigViaSSH,
	findSnapshot: findBaseSnapshot,
	createSnapshot: createBaseSnapshot,
	cleanupSnapshots: cleanupOldSnapshots,
	runSSHSetup: defaultRunSSHSetup,
	setupClaudeConfig: setupClaudeConfigViaSSH,
	now: () => new Date(),
	warn: (message: string) => {
		console.warn(message);
	},
	log: () => {},
};

const defaultNewCommandDependencies: NewCommandDependencies = {
	runNew: async (options, configPath, callbacks) => {
		return await runNew(
			options,
			{
				log: callbacks?.onProgress ?? (() => {}),
			},
			configPath,
		);
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
			update(message: string): void {
				spinner.update({ text: message });
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

	if (
		config.ssh_key_source === "agent" &&
		!gitConfigContent.includes("insteadOf = https://github.com/")
	) {
		gitConfigContent += `\n[url "ssh://git@github.com/"]\n\tinsteadOf = https://github.com/\n`;
	}

	const encoded = Buffer.from(gitConfigContent).toString("base64");

	const sshOptions = { ...buildSSHOptions(config, host), username: "root" };
	const client = deps.createSSHClient(sshOptions);

	await withSSHClient(client, async (c) => {
		await sshExec(c, `echo '${encoded}' | base64 -d > /home/agent/.gitconfig`);
		await sshExec(
			c,
			"chown agent:agent /home/agent/.gitconfig && chmod 644 /home/agent/.gitconfig",
		);
	});
}

async function setupClaudeConfigViaSSH(
	config: Config,
	host: string,
	deps: Pick<Dependencies, "createSSHClient">,
): Promise<void> {
	const hasConfig = hasClaudeConfig(config) && config.claude_config_path;
	const hasToken = hasClaudeOAuthToken(config);

	if (!hasConfig && !hasToken) {
		return;
	}

	const sshOptions = { ...buildSSHOptions(config, host), username: "root" };
	const client = deps.createSSHClient(sshOptions);

	await withSSHClient(client, async (c) => {
		await sshExec(c, "mkdir -p /home/agent/.claude");

		if (hasConfig && config.claude_config_path) {
			const claudeDir = expandTilde(config.claude_config_path);
			const filesToCopy = ["settings.json", "CLAUDE.md"];
			for (const file of filesToCopy) {
				const filePath = path.join(claudeDir, file);
				try {
					const info = await stat(filePath);
					if (!info.isFile()) continue;
					const content = await readFile(filePath, "utf8");
					const encoded = Buffer.from(content).toString("base64");
					await sshExec(
						c,
						`echo '${encoded}' | base64 -d > /home/agent/.claude/${file}`,
					);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "ENOENT") {
						continue;
					}
					throw error;
				}
			}
		}

		if (hasToken && config.claude_oauth_token) {
			const encoded = Buffer.from(
				`export CLAUDE_CODE_OAUTH_TOKEN='${config.claude_oauth_token}'\n`,
			).toString("base64");
			await sshExec(
				c,
				`echo '${encoded}' | base64 -d > /etc/profile.d/claude-oauth.sh && chmod 644 /etc/profile.d/claude-oauth.sh`,
			);

			// Claude Code requires hasCompletedOnboarding to skip the interactive
			// auth/onboarding flow even when a token is provided via env var.
			const onboarding = Buffer.from(
				JSON.stringify({ hasCompletedOnboarding: true }),
			).toString("base64");
			await sshExec(
				c,
				`echo '${onboarding}' | base64 -d > /home/agent/.claude.json && chown agent:agent /home/agent/.claude.json`,
			);
		}

		await sshExec(
			c,
			"chown -R agent:agent /home/agent/.claude && chmod -R 644 /home/agent/.claude/*",
		);
	});
}

async function defaultRunSSHSetup(
	config: Config,
	host: string,
	command: string,
	createClient: (options: SSHClientOptions) => SSHRuntimeClient,
): Promise<void> {
	const sshOptions = { ...buildSSHOptions(config, host), username: "root" };
	const client = createClient(sshOptions);
	await withSSHClient(client, async (c) => {
		await sshExec(c, command);
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

	// Resolve --size to a server type
	if (options.size) {
		if (options.serverType) {
			throw new Error(
				"cannot specify both --size and --server-type. Use one or the other.",
			);
		}
		const vmSize = resolveSize(options.size);
		if (!vmSize) {
			throw new Error(
				`unknown size '${options.size}'. Available sizes:\n${sizesHelpText()}`,
			);
		}
		options.serverType = vmSize.serverType;
	}

	// -T base is not allowed — the base template is applied automatically
	if (options.template && normalizeTemplateName(options.template) === "base") {
		throw new Error(
			"the 'base' template is applied automatically. Use `sandctl template edit base` to modify it.",
		);
	}

	// Load named template init content (if -T flag provided)
	let namedTemplateContent: string | undefined;
	if (options.template) {
		try {
			const template = await dependencies.templateStore.getInitScript(
				options.template,
			);
			namedTemplateContent = template.script;
		} catch (error) {
			if (error instanceof TemplateNotFoundError) {
				throw new Error(
					`template '${options.template}' not found. Use 'sandctl template list' to see available templates`,
				);
			}
			throw error;
		}
	}

	// Load user base template init content (optional, no error if missing)
	let userBaseContent: string | undefined;
	try {
		const baseTemplate = await dependencies.templateStore.getInitScript("base");
		userBaseContent = baseTemplate.script;
	} catch (error) {
		if (!(error instanceof TemplateNotFoundError)) {
			throw error;
		}
	}

	// Assemble user_data from layers
	const globalBase = generateCloudInit();
	const additionalLayers: string[] = [];
	if (userBaseContent) additionalLayers.push(userBaseContent);
	if (namedTemplateContent) additionalLayers.push(namedTemplateContent);
	const userData = assembleUserData(globalBase, additionalLayers);

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

	let sessionID: string;
	if (options.name) {
		const normalized = normalizeName(options.name);
		if (!validateID(normalized)) {
			throw new Error(
				`invalid session name '${options.name}'. Names must start with a letter, be 2-30 characters, and contain only lowercase letters, digits, and hyphens.`,
			);
		}
		if (existingNames.includes(normalized)) {
			throw new Error(
				`session '${normalized}' already exists. Use a different name or destroy the existing session first.`,
			);
		}
		sessionID = normalized;
	} else {
		sessionID = dependencies.generateSessionID(existingNames);
	}
	const createdAt = dependencies.now().toISOString();

	const publicKey = await dependencies.getPublicKey(config);
	const sshKeyID = await provider.ensureSSHKey(
		sshKeyName(publicKey),
		publicKey,
	);

	// Check for cached base snapshot (Hetzner only, skip if --image is set)
	const isHetzner = provider instanceof HetznerProvider;
	let snapshot: HetznerImage | null = null;
	if (isHetzner && !options.image) {
		try {
			snapshot = await dependencies.findSnapshot(provider.client, userData);
		} catch (error) {
			dependencies.warn(
				`[warn] Snapshot lookup failed, falling back to cloud-init: ${messageFromError(error)}`,
			);
		}
	}

	let createdVM: Awaited<ReturnType<typeof provider.create>> | undefined;

	try {
		dependencies.log("Creating VM...");
		if (snapshot) {
			createdVM = await provider.create({
				name: sessionID,
				region: options.region,
				serverType: options.serverType,
				image: String(snapshot.id),
				sshKeyIDs: [sshKeyID],
				skipUserData: true,
			});
		} else {
			createdVM = await provider.create({
				name: sessionID,
				region: options.region,
				serverType: options.serverType,
				image: options.image,
				sshKeyIDs: [sshKeyID],
				userData,
			});
		}

		await dependencies.store.add({
			id: sessionID,
			status: "provisioning",
			provider: providerName,
			provider_id: createdVM.id,
			ip_address: createdVM.ipAddress ?? "",
			region: createdVM.region,
			server_type: createdVM.serverType,
			created_at: createdAt,
		});

		dependencies.log("Waiting for VM to be ready...");
		await provider.waitReady(createdVM.id, waitReadyTimeoutMs(options));

		const readyVM = await provider.get(createdVM.id);

		if (readyVM.ipAddress) {
			if (snapshot) {
				// Booting from snapshot — copy SSH keys to agent user
				dependencies.log("Setting up SSH keys...");
				await dependencies.runSSHSetup(
					config,
					readyVM.ipAddress,
					generatePostSnapshotSSHSetup(),
					dependencies.createSSHClient,
				);
			} else {
				// Fresh boot — wait for cloud-init
				dependencies.log("Waiting for cloud-init to complete...");
				await dependencies.waitForCloudInit(
					config,
					readyVM.ipAddress,
					dependencies.createSSHClient,
					DEFAULT_CLOUD_INIT_TIMEOUT_MS,
				);

				// Create a base snapshot for next time (Hetzner only)
				if (isHetzner && !options.image) {
					try {
						dependencies.log("Creating base snapshot...");
						await dependencies.createSnapshot(
							provider.client,
							createdVM.id,
							userData,
						);
						await dependencies.cleanupSnapshots(provider.client, userData);
					} catch (error) {
						dependencies.warn(
							`[warn] Snapshot creation failed: ${messageFromError(error)}`,
						);
					}
				}
			}

			try {
				dependencies.log("Setting up git config...");
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

			try {
				dependencies.log("Setting up Claude Code config...");
				await dependencies.setupClaudeConfig(
					config,
					readyVM.ipAddress,
					dependencies,
				);
			} catch (error) {
				dependencies.warn(
					`[warn] Claude Code config setup failed: ${messageFromError(error)}`,
				);
			}
		}

		await dependencies.store.update(sessionID, {
			status: "running",
			ip_address: readyVM.ipAddress ?? "",
			region: readyVM.region,
			server_type: readyVM.serverType,
		});

		return {
			id: sessionID,
			status: "running",
			provider: providerName,
			provider_id: readyVM.id,
			ip_address: readyVM.ipAddress ?? "",
			region: readyVM.region,
			server_type: readyVM.serverType,
			created_at: createdAt,
		};
	} catch (error) {
		if (createdVM) {
			try {
				await provider.delete(createdVM.id);
			} catch (cleanupError) {
				dependencies.warn(
					`[warn] Failed to cleanup VM '${createdVM.id}': ${messageFromError(cleanupError)}`,
				);
			}

			try {
				await dependencies.store.update(sessionID, {
					status: "failed",
					failure_reason: messageFromError(error),
				});
			} catch (updateError) {
				dependencies.warn(
					`[warn] Failed to update session '${sessionID}': ${messageFromError(updateError)}`,
				);
			}
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

	const spinner = dependencies.createSpinner("Creating VM...");
	let session: Session;
	try {
		session = await dependencies.runNew(options, configPath, {
			onProgress: (message: string) => {
				spinner.update(message);
			},
		});
		spinner.succeed(`Created VM '${session.id}'.`);
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
				await dependencies.openRemoteConsole(c, {
					initialCommands: config.post_ssh_commands,
				});
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
		.option("-n, --name <name>", "Custom session name")
		.option("-p, --provider <provider>", "Provider name")
		.option("-T, --template <template>", "Template to initialize the session")
		.option("--region <region>", "Region override")
		.option(
			"-s, --size <size>",
			"VM size: small (3 vCPU/4 GB), medium (4 vCPU/8 GB), large (8 vCPU/16 GB), xlarge (16 vCPU/32 GB)",
		)
		.option("--server-type <serverType>", "Server type override")
		.option("--image <image>", "Image override")
		.option("-t, --timeout <timeout>", "Wait timeout (for example: 5m, 10m)")
		.option(
			"--no-console",
			"Skip automatic console connection after provisioning",
		)
		.action(async (options: NewOptions, command) => {
			const globals = command.optsWithGlobals() as {
				config?: string;
				json?: boolean;
			};
			if (globals.json) {
				options.noConsole = true;
				const noop = () => {};
				const session = await runNewCommand(options, globals.config, {
					createSpinner: () => ({ succeed: noop, fail: noop, update: noop }),
					log: noop,
					warn: noop,
				});
				console.log(JSON.stringify(session, null, 2));
				return;
			}
			await runNewCommand(options, globals.config);
		});
}
