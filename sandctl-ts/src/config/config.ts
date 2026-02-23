import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";

import { isValidEmail } from "@/utils/email";
import { expandTilde } from "@/utils/paths";

export interface ProviderConfig {
	token: string;
	region?: string;
	server_type?: string;
	image?: string;
	ssh_key_id?: number;
}

export interface Config {
	default_provider?: string;
	ssh_key_source?: "file" | "agent";
	ssh_public_key?: string;
	ssh_public_key_inline?: string;
	ssh_key_fingerprint?: string;
	providers?: Record<string, ProviderConfig>;
	sprites_token?: string;
	opencode_zen_key?: string;
	git_config_path?: string;
	git_user_name?: string;
	git_user_email?: string;
	github_token?: string;
}

export class NotFoundError extends Error {
	constructor(public readonly configPath: string) {
		super(`config file not found: ${configPath}`);
		this.name = "NotFoundError";
	}
}

export class InsecurePermissionsError extends Error {
	constructor(
		public readonly configPath: string,
		public readonly mode: number,
	) {
		super(
			`config file ${configPath} has insecure permissions ${mode.toString(8).padStart(4, "0")}, expected 0600`,
		);
		this.name = "InsecurePermissionsError";
	}
}

export class ValidationError extends Error {
	constructor(
		public readonly field: string,
		message: string,
	) {
		super(`config validation failed: ${field} ${message}`);
		this.name = "ValidationError";
	}
}

export function defaultConfigPath(): string {
	return path.join(os.homedir(), ".sandctl", "config");
}

function migrateLegacyConfig(config: Config): Config {
	if (!config.default_provider && config.sprites_token) {
		return {
			...config,
			default_provider: "hetzner",
			providers: {
				...(config.providers ?? {}),
				hetzner: {
					...(config.providers?.hetzner ?? {}),
					token: config.providers?.hetzner?.token ?? config.sprites_token,
				},
			},
		};
	}

	return config;
}

export async function load(configPath = defaultConfigPath()): Promise<Config> {
	const resolvedConfigPath = expandTilde(configPath);

	let info: Awaited<ReturnType<typeof stat>>;
	try {
		info = await stat(resolvedConfigPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new NotFoundError(resolvedConfigPath);
		}
		throw error;
	}

	const mode = info.mode & 0o777;
	if ((mode & 0o077) !== 0) {
		throw new InsecurePermissionsError(resolvedConfigPath, mode);
	}

	const parsed = parse(await readFile(resolvedConfigPath, "utf8")) as Config;
	const config = migrateLegacyConfig(parsed ?? {});
	validate(config);
	return config;
}

export function validate(config: Config): void {
	if (!config.default_provider) {
		throw new ValidationError("default_provider", "is required");
	}

	if (config.git_user_email && !isValidEmail(config.git_user_email)) {
		throw new ValidationError(
			"git_user_email",
			"format invalid: must contain @ with non-empty parts",
		);
	}

	if (config.ssh_key_source === "agent") {
		return;
	}

	if (!config.ssh_public_key) {
		throw new ValidationError(
			"ssh_public_key",
			"is required unless ssh_key_source is 'agent'",
		);
	}
}

export function getProviderConfig(
	config: Config,
	providerName: string,
): ProviderConfig | undefined {
	return config.providers?.[providerName];
}

export function setProviderSSHKeyID(
	config: Config,
	providerName: string,
	keyID: number,
): void {
	config.providers = config.providers ?? {};
	config.providers[providerName] = {
		...(config.providers[providerName] ?? { token: "" }),
		ssh_key_id: keyID,
	};
}

export async function getSSHPublicKey(config: Config): Promise<string> {
	if (config.ssh_key_source === "agent") {
		if (config.ssh_public_key_inline) {
			return config.ssh_public_key_inline.trim();
		}

		if (config.ssh_public_key) {
			return (
				await readFile(expandTilde(config.ssh_public_key), "utf8")
			).trim();
		}

		const defaultAgentPublicKeyPaths = [
			"~/.ssh/id_ed25519.pub",
			"~/.ssh/id_rsa.pub",
		];

		for (const candidate of defaultAgentPublicKeyPaths) {
			try {
				return (await readFile(expandTilde(candidate), "utf8")).trim();
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
					throw error;
				}
			}
		}

		throw new ValidationError(
			"ssh_public_key_inline",
			"or ssh_public_key is required when ssh_key_source is 'agent' (or place your key at ~/.ssh/id_ed25519.pub)",
		);
	}

	if (!config.ssh_public_key) {
		throw new ValidationError("ssh_public_key", "is required");
	}

	return (await readFile(expandTilde(config.ssh_public_key), "utf8")).trim();
}

export function getGitConfig(config: Config): {
	path?: string;
	name?: string;
	email?: string;
} {
	return {
		path: config.git_config_path,
		name: config.git_user_name,
		email: config.git_user_email,
	};
}

export function hasGitConfig(config: Config): boolean {
	return Boolean(
		config.git_config_path || (config.git_user_name && config.git_user_email),
	);
}

export function hasGitHubToken(config: Config): boolean {
	return Boolean(config.github_token);
}
