/**
 * Core config operations — pure business logic, no CLI dependencies.
 *
 * Handles configuration initialization (non-interactive), session details
 * retrieval, and URL building for session access.
 */

import type { Config } from "@/config/config";
import { getProviderConfig } from "@/config/config";
import type { Provider } from "@/provider/interface";
import type { VM } from "@/provider/types";
import { age, type Session, timeoutRemaining } from "@/session/types";

import { resolveSession, formatTimeout, formatCreatedAt } from "./sessions";
import { assertRunnable } from "./sessions";
import type { SessionStoreReader } from "./types";

// ---------------------------------------------------------------------------
// initConfig (non-interactive)
// ---------------------------------------------------------------------------

export interface InitConfigValues {
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
	claudeConfigPath?: string;
	claudeOauthToken?: string;
}

const DEFAULT_REGION = "ash";
const DEFAULT_SERVER_TYPE = "cpx31";

/**
 * Build a Config object from resolved values. No interactive prompts.
 */
export function buildConfig(values: InitConfigValues): Config {
	return {
		default_provider: "hetzner",
		ssh_key_source: values.sshAgent ? "agent" : undefined,
		ssh_public_key: values.sshAgent ? undefined : values.sshPublicKey,
		ssh_key_fingerprint: values.sshAgent
			? values.sshKeyFingerprint
			: undefined,
		providers: {
			hetzner: {
				token: values.hetznerToken ?? "",
				region: values.region ?? DEFAULT_REGION,
				server_type: values.serverType ?? DEFAULT_SERVER_TYPE,
				image: "ubuntu-24.04",
			},
		},
		opencode_zen_key: values.opencodeZenKey,
		git_config_path: values.gitConfigPath,
		git_user_name: values.gitUserName,
		git_user_email: values.gitUserEmail,
		github_token: values.githubToken,
		claude_config_path: values.claudeConfigPath,
		claude_oauth_token: values.claudeOauthToken,
	};
}

// ---------------------------------------------------------------------------
// getSessionDetails
// ---------------------------------------------------------------------------

export interface DetailsResult {
	id: string;
	status: string;
	provider: string;
	provider_id: string;
	ip_address: string;
	region: string;
	server_type: string;
	cores: number | null;
	memory_gb: number | null;
	disk_gb: number | null;
	cpu_type: string | null;
	created_at: string;
	uptime: string;
	timeout: string | null;
	timeout_remaining: string;
	failure_reason: string | null;
}

function formatAge(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		const remainingHours = hours % 24;
		return remainingHours > 0 ? `${days}d${remainingHours}h` : `${days}d`;
	}
	if (hours > 0) {
		const remainingMinutes = minutes % 60;
		return remainingMinutes > 0
			? `${hours}h${remainingMinutes}m`
			: `${hours}h`;
	}
	if (minutes > 0) {
		return `${minutes}m`;
	}
	return `${seconds}s`;
}

function buildDetailsResult(session: Session, vm: VM | null): DetailsResult {
	const remaining = timeoutRemaining(session);
	return {
		id: session.id,
		status: vm?.status ?? session.status,
		provider: session.provider,
		provider_id: session.provider_id,
		ip_address: vm?.ipAddress ?? (session.ip_address || "-"),
		region: vm?.region ?? session.region ?? "-",
		server_type: vm?.serverType ?? session.server_type ?? "-",
		cores: vm?.cores ?? null,
		memory_gb: vm?.memoryGB ?? null,
		disk_gb: vm?.diskGB ?? null,
		cpu_type: vm?.cpuType ?? null,
		created_at: session.created_at,
		uptime: formatAge(age(session)),
		timeout: session.timeout ?? null,
		timeout_remaining: formatTimeout(remaining),
		failure_reason: session.failure_reason ?? null,
	};
}

interface DetailsDeps {
	store: SessionStoreReader;
	loadConfig: (configPath?: string) => Promise<Config>;
	getProvider: (name: string, config: Config) => Provider;
}

/**
 * Get detailed VM information for a session, including hardware specs.
 * Throws `SessionNotFoundError` if session not found.
 */
export async function getSessionDetails(
	name: string,
	deps: DetailsDeps,
	configPath?: string,
): Promise<DetailsResult> {
	const session = await resolveSession(name, deps.store);

	let vm: VM | null = null;
	if (session.provider_id) {
		const config = await deps.loadConfig(configPath);
		const provider = deps.getProvider(session.provider, config);
		vm = await provider.get(session.provider_id);
	}

	return buildDetailsResult(session, vm);
}

// ---------------------------------------------------------------------------
// getSessionUrl
// ---------------------------------------------------------------------------

interface OpenOptions {
	port?: string;
	https?: boolean;
}

/**
 * Build the URL for accessing a session in a browser.
 * Throws `SessionNotFoundError` or `SessionNotReadyError`.
 */
export async function getSessionUrl(
	name: string,
	options: OpenOptions,
	deps: { store: SessionStoreReader },
): Promise<string> {
	const session = await resolveSession(name, deps.store);
	assertRunnable(session);

	const protocol = options.https ? "https" : "http";
	const port = options.port ?? (options.https ? "443" : "80");
	const portSuffix =
		(protocol === "http" && port === "80") ||
		(protocol === "https" && port === "443")
			? ""
			: `:${port}`;
	return `${protocol}://${session.ip_address}${portSuffix}`;
}
