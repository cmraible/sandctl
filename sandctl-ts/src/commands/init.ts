import { access } from "node:fs/promises";
import process from "node:process";
import { confirm, input, password, select } from "@inquirer/prompts";
import { Command } from "commander";

import type { Config } from "@/config/config";
import { load, NotFoundError } from "@/config/config";
import { save } from "@/config/writer";
import { isValidEmail } from "@/utils/email";
import { expandTilde } from "@/utils/paths";

interface InitOptions {
	hetznerToken?: string;
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
}

const DEFAULT_REGION = "ash";
const DEFAULT_SERVER_TYPE = "cpx31";

const REGION_CHOICES = [
	{ name: "Ashburn, Virginia, US (ash)", value: "ash" },
	{ name: "Helsinki, Finland (hel1)", value: "hel1" },
	{ name: "Falkenstein, Germany (fsn1)", value: "fsn1" },
	{ name: "Nuremberg, Germany (nbg1)", value: "nbg1" },
	{ name: "Hillsboro, Oregon, US (hil)", value: "hil" },
	{ name: "Singapore (sin)", value: "sin" },
] as const;

const SERVER_TYPE_CHOICES = [
	{ name: "CPX11 — 2 vCPU, 2 GB RAM, ~€0.01/hr (cpx11)", value: "cpx11" },
	{ name: "CPX21 — 3 vCPU, 4 GB RAM, ~€0.01/hr (cpx21)", value: "cpx21" },
	{ name: "CPX31 — 4 vCPU, 8 GB RAM, ~€0.02/hr (cpx31)", value: "cpx31" },
	{ name: "CPX41 — 8 vCPU, 16 GB RAM, ~€0.04/hr (cpx41)", value: "cpx41" },
	{ name: "CPX51 — 16 vCPU, 32 GB RAM, ~€0.07/hr (cpx51)", value: "cpx51" },
] as const;

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

export async function runInit(
	options: InitOptions,
	configPath: string,
): Promise<void> {
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

	const hasNonInteractiveFlags =
		Boolean(options.hetznerToken) ||
		Boolean(options.sshAgent) ||
		Boolean(options.sshPublicKey);

	if (hasNonInteractiveFlags) {
		if (!options.hetznerToken) {
			throw new Error("--hetzner-token is required in non-interactive mode");
		}
		if (!options.sshAgent && !options.sshPublicKey) {
			throw new Error(
				"--ssh-public-key or --ssh-agent is required in non-interactive mode",
			);
		}
		await save(resolvedConfigPath, buildConfig(options));
		console.log(`Configuration saved successfully to ${resolvedConfigPath}`);
		console.log("Next step: sandctl new");
		return;
	}

	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		throw new Error(
			"init requires a terminal for interactive mode, or use --hetzner-token with --ssh-agent or --ssh-public-key flags",
		);
	}

	let existing: Config | undefined;
	try {
		existing = await load(resolvedConfigPath);
	} catch (error) {
		if (!(error instanceof NotFoundError)) {
			throw error;
		}
	}

	const hetznerToken = await password({
		message: "Hetzner Cloud API token",
		mask: true,
	});
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
		default: existing?.providers?.hetzner?.region ?? DEFAULT_REGION,
		theme: VIM_SELECT_THEME,
		choices: REGION_CHOICES,
	});

	const serverType = await select({
		message: "Default server type",
		default: existing?.providers?.hetzner?.server_type ?? DEFAULT_SERVER_TYPE,
		theme: VIM_SELECT_THEME,
		choices: SERVER_TYPE_CHOICES,
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

	const githubToken = await password({
		message: "GitHub personal access token (optional)",
		mask: true,
	});

	await save(
		resolvedConfigPath,
		buildConfig({
			hetznerToken,
			sshPublicKey,
			sshAgent: sshMode === "agent",
			sshKeyFingerprint,
			region,
			serverType,
			gitConfigPath,
			gitUserName,
			gitUserEmail,
			githubToken,
		}),
	);
	console.log(`Configuration saved successfully to ${resolvedConfigPath}`);
	console.log("Next step: sandctl new");
}

function buildConfig(options: InitOptions): Config {
	return {
		default_provider: "hetzner",
		ssh_key_source: options.sshAgent ? "agent" : undefined,
		ssh_public_key: options.sshAgent ? undefined : options.sshPublicKey,
		ssh_key_fingerprint: options.sshAgent
			? options.sshKeyFingerprint
			: undefined,
		providers: {
			hetzner: {
				token: options.hetznerToken ?? "",
				region: options.region ?? DEFAULT_REGION,
				server_type: options.serverType ?? DEFAULT_SERVER_TYPE,
				image: "ubuntu-24.04",
			},
		},
		opencode_zen_key: options.opencodeZenKey,
		git_config_path: options.gitConfigPath,
		git_user_name: options.gitUserName,
		git_user_email: options.gitUserEmail,
		github_token: options.githubToken,
	};
}

export function registerInitCommand(): Command {
	return new Command("init")
		.description("Initialize sandctl configuration")
		.option("--hetzner-token <token>", "Hetzner Cloud API token")
		.option("--ssh-public-key <path>", "Path to SSH public key file")
		.option("--ssh-agent", "Use SSH agent for key management")
		.option("--ssh-key-fingerprint <fingerprint>", "SSH key fingerprint")
		.option(
			"--region <region>",
			"Default region (ash (Ashburn, VA), hel1 (Helsinki), fsn1 (Falkenstein), nbg1 (Nuremberg), hil (Hillsboro, OR), sin (Singapore))",
		)
		.option(
			"--server-type <serverType>",
			"Default server type (cpx11 (2 vCPU, 2 GB RAM), cpx21 (3 vCPU, 4 GB RAM), cpx31 (4 vCPU, 8 GB RAM), cpx41 (8 vCPU, 16 GB RAM), cpx51 (16 vCPU, 32 GB RAM))",
		)
		.option("--opencode-zen-key <key>", "Opencode Zen key")
		.option("--git-config-path <path>", "Path to gitconfig file")
		.option("--git-user-name <name>", "Git user.name")
		.option("--git-user-email <email>", "Git user.email")
		.option("--github-token <token>", "GitHub personal access token")
		.action(async (options: InitOptions, command) => {
			const globals = command.optsWithGlobals() as { config?: string };
			await runInit(options, globals.config ?? "~/.sandctl/config");
		});
}
