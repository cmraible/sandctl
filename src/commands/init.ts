import { access } from "node:fs/promises";
import process from "node:process";

import { confirm, input, password, select } from "@inquirer/prompts";
import { Command } from "commander";

import type { Config } from "@/config/config";
import { load, NotFoundError } from "@/config/config";
import { save } from "@/config/writer";
import { isValidEmail } from "@/utils/email";
import { expandTilde } from "@/utils/paths";

type SupportedProvider = "digitalocean" | "gcp" | "hetzner";

interface InitOptions {
	provider?: string;
	hetznerToken?: string;
	digitaloceanToken?: string;
	gcpProject?: string;
	gcpCredentialsFile?: string;
	sshPublicKey?: string;
	sshAgent?: boolean;
	sshKeyFingerprint?: string;
	region?: string;
	serverType?: string;
	opencodeZenKey?: string;
	gitConfigPath?: string;
	gitUserName?: string;
	gitUserEmail?: string;
	githubToken?: string;
	claudeConfigPath?: string;
	claudeOauthToken?: string;
}

const PROVIDER_METADATA = {
	digitalocean: {
		defaultRegion: "nyc1",
		defaultServerType: "s-4vcpu-8gb",
		defaultImage: "ubuntu-24-04-x64",
		tokenField: "digitaloceanToken" as const,
		tokenFlag: "--digitalocean-token",
		tokenLabel: "DigitalOcean API token",
		regionChoices: [
			{ name: "New York 1 (nyc1)", value: "nyc1" },
			{ name: "New York 3 (nyc3)", value: "nyc3" },
			{ name: "Toronto 1 (tor1)", value: "tor1" },
			{ name: "San Francisco 3 (sfo3)", value: "sfo3" },
			{ name: "London 1 (lon1)", value: "lon1" },
			{ name: "Amsterdam 3 (ams3)", value: "ams3" },
			{ name: "Frankfurt 1 (fra1)", value: "fra1" },
			{ name: "Singapore 1 (sgp1)", value: "sgp1" },
		],
		serverTypeChoices: [
			{
				name: "Basic 2 vCPU, 4 GB RAM (s-2vcpu-4gb)",
				value: "s-2vcpu-4gb",
			},
			{
				name: "Basic 4 vCPU, 8 GB RAM (s-4vcpu-8gb)",
				value: "s-4vcpu-8gb",
			},
			{
				name: "Basic 8 vCPU, 16 GB RAM (s-8vcpu-16gb)",
				value: "s-8vcpu-16gb",
			},
			{
				name: "Basic 16 vCPU, 32 GB RAM (s-16vcpu-32gb)",
				value: "s-16vcpu-32gb",
			},
		],
	},
	gcp: {
		defaultRegion: "us-central1-a",
		defaultServerType: "e2-standard-4",
		defaultImage:
			"projects/ubuntu-os-cloud/global/images/family/ubuntu-2404-lts-amd64",
		tokenField: undefined,
		tokenFlag: "--gcp-project",
		tokenLabel: "GCP project ID",
		regionChoices: [
			{ name: "Iowa, US (us-central1-a)", value: "us-central1-a" },
			{ name: "South Carolina, US (us-east1-b)", value: "us-east1-b" },
			{ name: "Oregon, US (us-west1-a)", value: "us-west1-a" },
			{ name: "London, UK (europe-west2-a)", value: "europe-west2-a" },
			{ name: "Frankfurt, Germany (europe-west3-a)", value: "europe-west3-a" },
			{ name: "Singapore (asia-southeast1-a)", value: "asia-southeast1-a" },
		],
		serverTypeChoices: [
			{
				name: "E2 standard 2 vCPU, 8 GB RAM (e2-standard-2)",
				value: "e2-standard-2",
			},
			{
				name: "E2 standard 4 vCPU, 16 GB RAM (e2-standard-4)",
				value: "e2-standard-4",
			},
			{
				name: "E2 standard 8 vCPU, 32 GB RAM (e2-standard-8)",
				value: "e2-standard-8",
			},
			{
				name: "E2 standard 16 vCPU, 64 GB RAM (e2-standard-16)",
				value: "e2-standard-16",
			},
		],
	},
	hetzner: {
		defaultRegion: "ash",
		defaultServerType: "cpx31",
		defaultImage: "ubuntu-24.04",
		tokenField: "hetznerToken" as const,
		tokenFlag: "--hetzner-token",
		tokenLabel: "Hetzner Cloud API token",
		regionChoices: [
			{ name: "Ashburn, Virginia, US (ash)", value: "ash" },
			{ name: "Helsinki, Finland (hel1)", value: "hel1" },
			{ name: "Falkenstein, Germany (fsn1)", value: "fsn1" },
			{ name: "Nuremberg, Germany (nbg1)", value: "nbg1" },
			{ name: "Hillsboro, Oregon, US (hil)", value: "hil" },
			{ name: "Singapore (sin)", value: "sin" },
		],
		serverTypeChoices: [
			{ name: "CPX11 — 2 vCPU, 2 GB RAM, ~€0.01/hr (cpx11)", value: "cpx11" },
			{ name: "CPX21 — 3 vCPU, 4 GB RAM, ~€0.01/hr (cpx21)", value: "cpx21" },
			{ name: "CPX31 — 4 vCPU, 8 GB RAM, ~€0.02/hr (cpx31)", value: "cpx31" },
			{ name: "CPX41 — 8 vCPU, 16 GB RAM, ~€0.04/hr (cpx41)", value: "cpx41" },
			{ name: "CPX51 — 16 vCPU, 32 GB RAM, ~€0.07/hr (cpx51)", value: "cpx51" },
		],
	},
} as const;

const VIM_SELECT_THEME = {
	keybindings: ["vim" as const],
	style: {
		keysHelpTip: () => undefined,
	},
};

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

function resolveProvider(
	provider?: string,
	options?: InitOptions,
): SupportedProvider {
	const tokenProviderFlags = [
		options?.hetznerToken ? "hetzner" : undefined,
		options?.digitaloceanToken ? "digitalocean" : undefined,
		options?.gcpProject ? "gcp" : undefined,
	].filter(Boolean);
	if (tokenProviderFlags.length > 1) {
		throw new Error(
			"--hetzner-token, --digitalocean-token, and --gcp-project cannot be used together",
		);
	}

	if (provider) {
		if (
			provider === "hetzner" ||
			provider === "digitalocean" ||
			provider === "gcp"
		) {
			return provider;
		}
		throw new Error(`unsupported provider '${provider}'`);
	}

	if (options?.digitaloceanToken) {
		return "digitalocean";
	}
	if (options?.gcpProject) {
		return "gcp";
	}

	return "hetzner";
}

function providerToken(
	provider: SupportedProvider,
	options: InitOptions,
): string | undefined {
	const tokenField = PROVIDER_METADATA[provider].tokenField;
	return tokenField ? options[tokenField] : undefined;
}

function hasProviderCredential(
	provider: SupportedProvider,
	options: InitOptions,
): boolean {
	if (provider === "gcp") {
		return Boolean(options.gcpProject);
	}
	return Boolean(providerToken(provider, options));
}

function optionalText(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export interface InitResult {
	config_path: string;
	saved: boolean;
}

export async function runInit(
	options: InitOptions,
	configPath: string,
): Promise<InitResult> {
	const resolvedConfigPath = expandTilde(configPath);

	if (options.sshAgent && options.sshPublicKey) {
		throw new Error("--ssh-agent and --ssh-public-key are mutually exclusive");
	}

	if (Boolean(options.gitUserName) !== Boolean(options.gitUserEmail)) {
		throw new Error(
			"--git-user-name and --git-user-email must be provided together",
		);
	}

	if (options.gitUserEmail && !isValidEmail(options.gitUserEmail)) {
		throw new Error(
			"git user email format invalid: must contain @ with non-empty parts",
		);
	}

	if (
		options.sshPublicKey &&
		!(await pathExists(expandTilde(options.sshPublicKey)))
	) {
		throw new Error(
			`SSH public key not found: ${expandTilde(options.sshPublicKey)}`,
		);
	}

	if (
		options.gitConfigPath &&
		!(await pathExists(expandTilde(options.gitConfigPath)))
	) {
		throw new Error(
			`git config file not found: ${expandTilde(options.gitConfigPath)}`,
		);
	}

	const selectedProvider = resolveProvider(options.provider, options);
	const selectedProviderMeta = PROVIDER_METADATA[selectedProvider];

	const hasNonInteractiveFlags =
		hasProviderCredential(selectedProvider, options) ||
		Boolean(options.sshAgent) ||
		Boolean(options.sshPublicKey);

	let existing: Config | undefined;
	try {
		existing = await load(resolvedConfigPath);
	} catch (error) {
		if (!(error instanceof NotFoundError)) {
			throw error;
		}
	}

	if (hasNonInteractiveFlags) {
		if (!hasProviderCredential(selectedProvider, options)) {
			throw new Error(
				`${selectedProviderMeta.tokenFlag} is required in non-interactive mode`,
			);
		}
		if (!options.sshAgent && !options.sshPublicKey) {
			throw new Error(
				"--ssh-public-key or --ssh-agent is required in non-interactive mode",
			);
		}
		await save(
			resolvedConfigPath,
			buildConfig(selectedProvider, options, existing),
		);
		return { config_path: resolvedConfigPath, saved: true };
	}

	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		throw new Error(
			`init requires a terminal for interactive mode, or use ${selectedProviderMeta.tokenFlag} with --ssh-agent or --ssh-public-key flags`,
		);
	}

	const provider = await select<SupportedProvider>({
		message: "Default provider",
		default:
			existing?.default_provider === "digitalocean" ||
			existing?.default_provider === "gcp"
				? existing.default_provider
				: "hetzner",
		theme: VIM_SELECT_THEME,
		choices: [
			{ name: "Hetzner", value: "hetzner" },
			{ name: "DigitalOcean", value: "digitalocean" },
			{ name: "GCP Compute Engine", value: "gcp" },
		],
	});
	const providerMeta = PROVIDER_METADATA[provider];

	let token: string | undefined;
	let gcpProject: string | undefined;
	let gcpCredentialsFile: string | undefined;
	if (provider === "gcp") {
		gcpProject = optionalText(
			await input({
				message: `${providerMeta.tokenLabel}${existing?.providers?.gcp?.project_id ? " (leave blank to keep existing)" : ""}`,
				default: existing?.providers?.gcp?.project_id,
			}),
		);
		gcpCredentialsFile = optionalText(
			await input({
				message:
					"GCP service-account credentials file (optional; blank uses ADC)",
				default: existing?.providers?.gcp?.credentials_file,
			}),
		);
	} else {
		token =
			(await password({
				message: `${providerMeta.tokenLabel}${existing?.providers?.[provider]?.token ? " (leave blank to keep existing)" : ""}`,
				mask: true,
			})) || existing?.providers?.[provider]?.token;
	}

	const sshMode = await select({
		message: "SSH key mode",
		default: existing?.ssh_key_source === "agent" ? "agent" : "file",
		theme: VIM_SELECT_THEME,
		choices: [
			{ name: "SSH key file", value: "file" },
			{ name: "SSH agent", value: "agent" },
		],
	});

	const sshPublicKey =
		sshMode === "file"
			? await input({
					message: "SSH public key path",
					default: existing?.ssh_public_key ?? "~/.ssh/id_ed25519.pub",
				})
			: undefined;

	const sshKeyFingerprint =
		sshMode === "agent"
			? await input({
					message: "SSH key fingerprint (optional)",
					default: existing?.ssh_key_fingerprint,
				})
			: undefined;

	const region = await select({
		message: "Default region",
		default:
			existing?.providers?.[provider]?.region ?? providerMeta.defaultRegion,
		theme: VIM_SELECT_THEME,
		choices: providerMeta.regionChoices,
	});

	const serverType = await select({
		message: "Default server type",
		default:
			existing?.providers?.[provider]?.server_type ??
			providerMeta.defaultServerType,
		theme: VIM_SELECT_THEME,
		choices: providerMeta.serverTypeChoices,
	});

	const gitConfigDetected = await pathExists(expandTilde("~/.gitconfig"));
	const useGitConfigPath = gitConfigDetected
		? await confirm({
				message: "Use ~/.gitconfig for git name/email?",
				default: true,
			})
		: false;

	const gitUserName = useGitConfigPath
		? undefined
		: await input({
				message: "Git user name (optional)",
				default: existing?.git_user_name,
			});

	const gitUserEmail = useGitConfigPath
		? undefined
		: await input({
				message: "Git user email (optional)",
				default: existing?.git_user_email,
			});
	if (gitUserEmail && !isValidEmail(gitUserEmail)) {
		throw new Error(
			"git user email format invalid: must contain @ with non-empty parts",
		);
	}

	const gitConfigPath = useGitConfigPath
		? "~/.gitconfig"
		: await input({
				message: "Git config file path (optional)",
				default: existing?.git_config_path,
			});

	const githubToken =
		(await password({
			message: `GitHub personal access token${existing?.github_token ? " (leave blank to keep existing)" : " (optional)"}`,
			mask: true,
		})) || existing?.github_token;

	const claudeConfigDetected = await pathExists(
		expandTilde("~/.claude/settings.json"),
	);
	let claudeConfigPath: string | undefined;
	if (claudeConfigDetected) {
		const claudeConfigChoice = await select({
			message: "Claude Code configuration for VMs",
			default:
				existing?.claude_config_path === "~/.claude"
					? "local"
					: existing?.claude_config_path === "~/.sandctl/claude"
						? "sandctl"
						: existing?.claude_config_path
							? "local"
							: "skip",
			theme: VIM_SELECT_THEME,
			choices: [
				{ name: "Use my local ~/.claude config", value: "local" },
				{
					name: "Create a sandctl-specific config (~/.sandctl/claude/)",
					value: "sandctl",
				},
				{ name: "Skip", value: "skip" },
			],
		});
		if (claudeConfigChoice === "local") {
			claudeConfigPath = "~/.claude";
		} else if (claudeConfigChoice === "sandctl") {
			claudeConfigPath = "~/.sandctl/claude";
			const sandctlClaudePath = expandTilde("~/.sandctl/claude");
			if (!(await pathExists(`${sandctlClaudePath}/settings.json`))) {
				const { mkdir, writeFile } = await import("node:fs/promises");
				await mkdir(sandctlClaudePath, { recursive: true });
				await writeFile(
					`${sandctlClaudePath}/settings.json`,
					JSON.stringify({}, null, 2),
				);
				console.log(
					`Created ${sandctlClaudePath}/settings.json — edit it to customize.`,
				);
			}
		}
	} else {
		claudeConfigPath = existing?.claude_config_path;
	}

	const claudeOauthToken =
		(await password({
			message: `Claude Code OAuth token (from 'claude setup-token')${existing?.claude_oauth_token ? " (leave blank to keep existing)" : " (optional)"}`,
			mask: true,
		})) || existing?.claude_oauth_token;

	const interactiveOptions: InitOptions = {
		provider,
		sshPublicKey,
		sshAgent: sshMode === "agent",
		sshKeyFingerprint,
		region,
		serverType,
		gitConfigPath,
		gitUserName,
		gitUserEmail,
		githubToken,
		claudeConfigPath,
		claudeOauthToken,
		gcpProject,
		gcpCredentialsFile,
	};
	if (provider !== "gcp" && providerMeta.tokenField) {
		interactiveOptions[providerMeta.tokenField] = token;
	}

	await save(
		resolvedConfigPath,
		buildConfig(provider, interactiveOptions, existing),
	);
	return { config_path: resolvedConfigPath, saved: true };
}

function buildConfig(
	provider: SupportedProvider,
	options: InitOptions,
	existing?: Config,
): Config {
	const metadata = PROVIDER_METADATA[provider];
	const token =
		providerToken(provider, options) ?? existing?.providers?.[provider]?.token;

	return {
		...existing,
		default_provider: provider,
		ssh_key_source: options.sshAgent
			? "agent"
			: options.sshPublicKey
				? undefined
				: existing?.ssh_key_source,
		ssh_public_key: options.sshAgent
			? undefined
			: (options.sshPublicKey ?? existing?.ssh_public_key),
		ssh_key_fingerprint: options.sshAgent
			? options.sshKeyFingerprint
			: undefined,
		providers: {
			...(existing?.providers ?? {}),
			[provider]: {
				...(existing?.providers?.[provider] ?? {}),
				token: provider === "gcp" ? undefined : (token ?? ""),
				project_id:
					provider === "gcp"
						? (options.gcpProject ?? existing?.providers?.gcp?.project_id)
						: undefined,
				credentials_file:
					provider === "gcp"
						? (options.gcpCredentialsFile ??
							existing?.providers?.gcp?.credentials_file)
						: undefined,
				region:
					options.region ??
					existing?.providers?.[provider]?.region ??
					metadata.defaultRegion,
				server_type:
					options.serverType ??
					existing?.providers?.[provider]?.server_type ??
					metadata.defaultServerType,
				image: existing?.providers?.[provider]?.image ?? metadata.defaultImage,
			},
		},
		opencode_zen_key: options.opencodeZenKey ?? existing?.opencode_zen_key,
		git_config_path: options.gitConfigPath ?? existing?.git_config_path,
		git_user_name: options.gitUserName ?? existing?.git_user_name,
		git_user_email: options.gitUserEmail ?? existing?.git_user_email,
		github_token: options.githubToken ?? existing?.github_token,
		claude_config_path:
			options.claudeConfigPath ?? existing?.claude_config_path,
		claude_oauth_token:
			options.claudeOauthToken ?? existing?.claude_oauth_token,
	};
}

export function registerInitCommand(): Command {
	return new Command("init")
		.description("Initialize sandctl configuration")
		.option(
			"--provider <provider>",
			"Default provider (hetzner, digitalocean, or gcp)",
		)
		.option("--hetzner-token <token>", "Hetzner Cloud API token")
		.option("--digitalocean-token <token>", "DigitalOcean API token")
		.option("--gcp-project <project>", "GCP project ID")
		.option(
			"--gcp-credentials-file <path>",
			"GCP service-account credentials JSON file (optional; defaults to ADC)",
		)
		.option("--ssh-public-key <path>", "Path to SSH public key file")
		.option("--ssh-agent", "Use SSH agent for key management")
		.option("--ssh-key-fingerprint <fingerprint>", "SSH key fingerprint")
		.option("--region <region>", "Default region for the selected provider")
		.option(
			"--server-type <serverType>",
			"Default server type for the selected provider",
		)
		.option("--opencode-zen-key <key>", "Opencode Zen key")
		.option("--git-config-path <path>", "Path to gitconfig file")
		.option("--git-user-name <name>", "Git user.name")
		.option("--git-user-email <email>", "Git user.email")
		.option("--github-token <token>", "GitHub personal access token")
		.option(
			"--claude-oauth-token <token>",
			"Claude Code OAuth token (from 'claude setup-token')",
		)
		.action(async (options: InitOptions, command) => {
			const globals = command.optsWithGlobals() as {
				config?: string;
				json?: boolean;
			};
			if (globals.json) {
				const hasNonInteractiveFlags =
					hasProviderCredential(
						resolveProvider(options.provider, options),
						options,
					) ||
					Boolean(options.sshAgent) ||
					Boolean(options.sshPublicKey);
				if (!hasNonInteractiveFlags) {
					throw new Error(
						"--json requires non-interactive flags (provider credentials with --ssh-agent or --ssh-public-key)",
					);
				}
			}
			const result = await runInit(
				options,
				globals.config ?? "~/.sandctl/config",
			);
			if (globals.json) {
				console.log(JSON.stringify(result, null, 2));
			} else {
				console.log(
					`Configuration saved successfully to ${result.config_path}`,
				);
				console.log("Next step: sandctl new");
			}
		});
}
