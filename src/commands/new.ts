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
import { assembleUserData, generateCloudInit } from "@/provider/cloud-init";
import type { SnapshotReference } from "@/provider/interface";
import { supportsSnapshots } from "@/provider/interface";
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
	image?: string;
	timeout?: string;
	template?: string;
	noConsole?: boolean;
	bare?: boolean;
	timings?: boolean;
	noCache?: boolean;
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
	) => Promise<NewResult>;
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
	nowMs: () => number;
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
	runSSHSetup: defaultRunSSHSetup,
	setupClaudeConfig: setupClaudeConfigViaSSH,
	now: () => new Date(),
	nowMs: () => Date.now(),
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

function formatElapsed(ms: number): string {
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}

	const seconds = ms / 1000;
	if (seconds < 10) {
		return `${seconds.toFixed(1)}s`;
	}
	if (seconds < 60) {
		return `${Math.round(seconds)}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.round(seconds % 60);
	return `${minutes}m${remainingSeconds}s`;
}

function formatTimingSummary(summary: TimingSummary): string[] {
	const lines = [
		"Timing summary:",
		`Snapshot: ${summary.snapshotHit ? "hit" : "miss"}${
			summary.snapshotLookupMs !== undefined
				? ` (${formatElapsed(summary.snapshotLookupMs)} lookup)`
				: ""
		}`,
		`VM create: ${formatElapsed(summary.vmCreateMs)}`,
		`Wait ready: ${formatElapsed(summary.waitReadyMs)}`,
	];

	if (summary.cloudInitMs !== undefined) {
		lines.push(`Cloud-init: ${formatElapsed(summary.cloudInitMs)}`);
	}
	if (summary.sshKeySyncMs !== undefined) {
		lines.push(`SSH key sync: ${formatElapsed(summary.sshKeySyncMs)}`);
	}
	if (summary.gitSetupMs !== undefined) {
		lines.push(`Git setup: ${formatElapsed(summary.gitSetupMs)}`);
	}
	if (summary.claudeSetupMs !== undefined) {
		lines.push(`Claude setup: ${formatElapsed(summary.claudeSetupMs)}`);
	}

	lines.push(`Total to ready: ${formatElapsed(summary.totalMs)}`);
	if (summary.backgroundSnapshotDeferred) {
		lines.push("Background snapshot: deferred");
	}

	return lines;
}

async function measure<T>(
	nowMs: () => number,
	fn: () => Promise<T>,
): Promise<{ result: T; elapsedMs: number }> {
	const startedAt = nowMs();
	const result = await fn();
	return {
		result,
		elapsedMs: Math.max(0, nowMs() - startedAt),
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const AGENT_TOOL_CHECKS: readonly { name: string; command: string }[] = [
	{ name: "zsh", command: "zsh --version" },
	{ name: "gh", command: "gh --version" },
	{ name: "codex", command: "codex --version" },
	{ name: "claude", command: "claude --version" },
	{ name: "docker", command: "docker --version" },
];

async function defaultWaitForCloudInit(
	config: Config,
	host: string,
	createClient: (options: SSHClientOptions) => SSHRuntimeClient,
	timeoutMs: number,
): Promise<void> {
	const sshOptions = { ...buildSSHOptions(config, host), username: "root" };
	const deadline = Date.now() + timeoutMs;

	// Phase 1: poll for cloud-init's boot-finished marker. This is the
	// authoritative signal that cloud-init has run to completion (including
	// runcmd). SSH may not even be accepting connections on the first few
	// iterations; swallow those errors and keep polling.
	let bootFinished = false;
	while (Date.now() < deadline) {
		try {
			const client = createClient(sshOptions);
			const result = await withSSHClient(client, (c) =>
				sshExec(c, "test -f /var/lib/cloud/instance/boot-finished"),
			);
			if (result.exitCode === 0) {
				bootFinished = true;
				break;
			}
		} catch {
			// SSH not ready yet; keep polling
		}
		await sleep(CLOUD_INIT_POLL_INTERVAL_MS);
	}

	if (!bootFinished) {
		throw new Error(
			`cloud-init did not complete within ${Math.round(timeoutMs / 1000)}s (boot-finished marker never appeared)`,
		);
	}

	// Phase 2: cloud-init is done. Verify the agent-user tools installed by
	// runcmd are actually runnable. Run each check exactly once and capture
	// exit code + stderr so a failure tells us *which* tool is broken. If
	// anything fails, also grab the tail of cloud-init-output.log so we can
	// see *why* the install script didn't produce a working binary.
	const client = createClient(sshOptions);
	const { failures, logTail } = await withSSHClient(client, async (c) => {
		const collected: string[] = [];
		for (const check of AGENT_TOOL_CHECKS) {
			const command = `su - agent -c 'export PATH="$HOME/.local/bin:$PATH"; ${check.command}'`;
			const result = await sshExec(c, command);
			if (result.exitCode !== 0) {
				collected.push(
					`  ${check.name} (exit ${result.exitCode})\n    stdout: ${result.stdout.trim() || "<empty>"}\n    stderr: ${result.stderr.trim() || "<empty>"}`,
				);
			}
		}
		if (collected.length === 0) {
			return { failures: collected, logTail: "" };
		}
		const tailResult = await sshExec(
			c,
			"tail -n 200 /var/log/cloud-init-output.log",
		);
		return {
			failures: collected,
			logTail:
				tailResult.exitCode === 0
					? tailResult.stdout
					: `<unable to read cloud-init-output.log: exit ${tailResult.exitCode} ${tailResult.stderr.trim()}>`,
		};
	});

	if (failures.length > 0) {
		throw new Error(
			`cloud-init finished but agent tool verification failed:\n${failures.join("\n")}\n\nLast 200 lines of /var/log/cloud-init-output.log:\n${logTail}`,
		);
	}
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
				`echo '${encoded}' | base64 -d > /home/agent/.zshenv && chown agent:agent /home/agent/.zshenv && chmod 600 /home/agent/.zshenv`,
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

export interface NewResult {
	session: Session;
	timingSummary: TimingSummary;
	/** Optional background work (e.g. snapshot creation) that can be awaited after
	 *  the user is already working in the console. Resolves silently on failure. */
	backgroundTasks?: Promise<void>;
}

interface TimingSummary {
	snapshotLookupMs?: number;
	snapshotHit: boolean;
	vmCreateMs: number;
	waitReadyMs: number;
	cloudInitMs?: number;
	sshKeySyncMs?: number;
	gitSetupMs?: number;
	claudeSetupMs?: number;
	totalMs: number;
	backgroundSnapshotDeferred: boolean;
}

export async function runNew(
	options: NewOptions,
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<NewResult> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	const config = await dependencies.loadConfig(configPath);
	const provisioningStartedAt = dependencies.nowMs();
	let snapshotLookupMs: number | undefined;
	let vmCreateMs = 0;
	let waitReadyMs = 0;
	let cloudInitMs: number | undefined;
	let sshKeySyncMs: number | undefined;
	let gitSetupMs: number | undefined;
	let claudeSetupMs: number | undefined;
	let backgroundSnapshotDeferred = false;
	const providerName =
		options.provider ?? config.default_provider ?? DEFAULT_PROVIDER;

	let resolvedServerType: string | undefined;
	if (options.size) {
		const vmSize = resolveSize(options.size, providerName);
		if (!vmSize) {
			throw new Error(
				`unknown size '${options.size}'. Available sizes:\n${sizesHelpText(providerName)}`,
			);
		}
		resolvedServerType = vmSize.serverType;
	}

	if (options.template && normalizeTemplateName(options.template) === "base") {
		throw new Error(
			"the 'base' template is applied automatically. Use `sandctl template edit base` to modify it.",
		);
	}

	if (options.bare && options.template) {
		throw new Error("--bare and -T cannot be used together.");
	}

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

	let userBaseContent: string | undefined;
	if (!options.bare) {
		try {
			const baseTemplate =
				await dependencies.templateStore.getInitScript("base");
			userBaseContent = baseTemplate.script;
		} catch (error) {
			if (!(error instanceof TemplateNotFoundError)) {
				throw error;
			}
		}
	}

	const globalBase = generateCloudInit();
	const additionalLayers: string[] = [];
	if (userBaseContent) additionalLayers.push(userBaseContent);
	if (namedTemplateContent) additionalLayers.push(namedTemplateContent);
	const userData = assembleUserData(globalBase, additionalLayers);

	const providerConfig = getProviderConfig(config, providerName);
	if (!providerConfig) {
		throw new Error(`provider '${providerName}' is not configured`);
	}

	const provider = dependencies.resolveProvider(providerName, providerConfig);
	const snapshotProvider =
		!options.image && supportsSnapshots(provider) ? provider : null;
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

	let snapshot: SnapshotReference | null = null;
	if (options.noCache) {
		dependencies.log("Snapshot cache disabled (--no-cache).");
	} else if (snapshotProvider) {
		try {
			dependencies.log("Looking for matching snapshot...");
			const snapshotLookup = await measure(dependencies.nowMs, async () => {
				return await snapshotProvider.findSnapshot(userData);
			});
			snapshot = snapshotLookup.result;
			snapshotLookupMs = snapshotLookup.elapsedMs;
			dependencies.log(
				`Snapshot lookup: ${snapshot ? "hit" : "miss"} (${formatElapsed(snapshotLookup.elapsedMs)})`,
			);
		} catch (error) {
			dependencies.warn(
				`[warn] Snapshot lookup failed, falling back to cloud-init: ${messageFromError(error)}`,
			);
		}
	}

	let createdVM: Awaited<ReturnType<typeof provider.create>> | undefined;

	try {
		dependencies.log("Creating VM...");
		const createStartedAt = dependencies.nowMs();
		if (snapshot) {
			createdVM = await provider.create({
				name: sessionID,
				region: options.region,
				serverType: resolvedServerType,
				image: String(snapshot.id),
				sshKeyIDs: [sshKeyID],
				skipUserData: true,
			});
		} else {
			createdVM = await provider.create({
				name: sessionID,
				region: options.region,
				serverType: resolvedServerType,
				image: options.image,
				sshKeyIDs: [sshKeyID],
				userData,
			});
		}
		vmCreateMs = Math.max(0, dependencies.nowMs() - createStartedAt);
		dependencies.log(`VM created in ${formatElapsed(vmCreateMs)}.`);

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
		const waitReadyStartedAt = dependencies.nowMs();
		await provider.waitReady(createdVM.id, waitReadyTimeoutMs(options));
		waitReadyMs = Math.max(0, dependencies.nowMs() - waitReadyStartedAt);
		dependencies.log(`VM became reachable in ${formatElapsed(waitReadyMs)}.`);

		const readyVM = await provider.get(createdVM.id);

		let backgroundTasks: Promise<void> | undefined;
		const vmId = createdVM.id;

		if (readyVM.ipAddress) {
			if (snapshot) {
				dependencies.log("Setting up SSH keys...");
				const sshSetupStartedAt = dependencies.nowMs();
				await dependencies.runSSHSetup(
					config,
					readyVM.ipAddress,
					snapshotProvider.postSnapshotSSHSetupCommand(),
					dependencies.createSSHClient,
				);
				sshKeySyncMs = Math.max(0, dependencies.nowMs() - sshSetupStartedAt);
				dependencies.log(
					`SSH key sync completed in ${formatElapsed(sshKeySyncMs)}.`,
				);
			} else {
				dependencies.log("Waiting for cloud-init to complete...");
				const cloudInitStartedAt = dependencies.nowMs();
				await dependencies.waitForCloudInit(
					config,
					readyVM.ipAddress,
					dependencies.createSSHClient,
					DEFAULT_CLOUD_INIT_TIMEOUT_MS,
				);
				cloudInitMs = Math.max(0, dependencies.nowMs() - cloudInitStartedAt);
				dependencies.log(
					`Cloud-init completed in ${formatElapsed(cloudInitMs)}.`,
				);

				if (snapshotProvider && !options.noCache) {
					backgroundSnapshotDeferred = true;
					backgroundTasks = (async () => {
						try {
							dependencies.log("Creating reusable snapshot in background...");
							const snapshotStartedAt = dependencies.nowMs();
							await snapshotProvider.createSnapshot(vmId, userData);
							await snapshotProvider.cleanupSnapshots(userData);
							dependencies.log(
								`Background snapshot completed in ${formatElapsed(dependencies.nowMs() - snapshotStartedAt)}.`,
							);
						} catch (error) {
							dependencies.warn(
								`[warn] Snapshot creation failed: ${messageFromError(error)}`,
							);
						}
					})();
				}
			}

			try {
				dependencies.log("Setting up git config...");
				const gitSetupStartedAt = dependencies.nowMs();
				await dependencies.setupGitConfig(
					config,
					readyVM.ipAddress,
					dependencies,
				);
				gitSetupMs = Math.max(0, dependencies.nowMs() - gitSetupStartedAt);
				dependencies.log(
					`Git config setup completed in ${formatElapsed(gitSetupMs)}.`,
				);
			} catch (error) {
				dependencies.warn(
					`[warn] Git config setup failed: ${messageFromError(error)}`,
				);
			}

			try {
				dependencies.log("Setting up Claude Code config...");
				const claudeSetupStartedAt = dependencies.nowMs();
				await dependencies.setupClaudeConfig(
					config,
					readyVM.ipAddress,
					dependencies,
				);
				claudeSetupMs = Math.max(
					0,
					dependencies.nowMs() - claudeSetupStartedAt,
				);
				dependencies.log(
					`Claude Code setup completed in ${formatElapsed(claudeSetupMs)}.`,
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
		const timingSummary: TimingSummary = {
			snapshotLookupMs,
			snapshotHit: snapshot !== null,
			vmCreateMs,
			waitReadyMs,
			cloudInitMs,
			sshKeySyncMs,
			gitSetupMs,
			claudeSetupMs,
			totalMs: Math.max(0, dependencies.nowMs() - provisioningStartedAt),
			backgroundSnapshotDeferred,
		};

		dependencies.log(
			`Provisioning completed in ${formatElapsed(timingSummary.totalMs)} (${snapshot ? "snapshot hit" : "snapshot miss"}).`,
		);

		return { session, timingSummary, backgroundTasks };
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
	let result: NewResult;
	try {
		result = await dependencies.runNew(options, configPath, {
			onProgress: (message: string) => {
				spinner.update(message);
			},
		});
		spinner.succeed(`Created VM '${result.session.id}'.`);
	} catch (error) {
		spinner.fail("Failed to provision VM.");
		throw error;
	}

	const { session, backgroundTasks } = result;

	const shouldConsole =
		!options.noConsole &&
		!options.timings &&
		dependencies.isInteractive() &&
		session.ip_address;

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
	} else if (!options.noConsole && !options.timings) {
		dependencies.log(`Use 'sandctl console ${session.id}' to connect.`);
		dependencies.log(`Use 'sandctl destroy ${session.id}' when done.`);
	}

	if (options.timings) {
		for (const line of formatTimingSummary(result.timingSummary)) {
			dependencies.log(line);
		}
	}

	// Wait for background tasks (e.g. snapshot creation) after the console exits
	if (backgroundTasks && !options.timings) {
		await backgroundTasks;
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
		.option("--image <image>", "Image override")
		.option("-t, --timeout <timeout>", "Wait timeout (for example: 5m, 10m)")
		.option(
			"--no-console",
			"Skip automatic console connection after provisioning",
		)
		.option(
			"--timings",
			"Skip console attach and print a provisioning timing summary",
		)
		.option("--bare", "Skip user base template and use only the global base")
		.option("--no-cache", "Bypass snapshot cache and provision from scratch")
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
