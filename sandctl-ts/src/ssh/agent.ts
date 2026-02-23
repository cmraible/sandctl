import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const ONEPASSWORD_SOCKETS = [
	"Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock",
	".1password/agent.sock",
];

export interface AgentDiscoveryDeps {
	homeDir(): string;
	readFile(path: string): Promise<string>;
	env(name: string): string | undefined;
	pathExists(path: string): Promise<boolean>;
}

const defaultDeps: AgentDiscoveryDeps = {
	homeDir: () => homedir(),
	readFile: (path) => readFile(path, "utf8"),
	env: (name) => process.env[name],
	pathExists: async (path) => {
		try {
			await access(path);
			return true;
		} catch {
			return false;
		}
	},
};

export async function discoverAgentSockets(
	deps: AgentDiscoveryDeps = defaultDeps,
): Promise<string[]> {
	const home = deps.homeDir();
	const sockets: string[] = [];
	const seen = new Set<string>();

	const addSocket = async (socket: string | undefined): Promise<void> => {
		if (!socket || seen.has(socket)) {
			return;
		}
		if (await deps.pathExists(socket)) {
			seen.add(socket);
			sockets.push(socket);
		}
	};

	let sshConfig = "";
	try {
		sshConfig = await deps.readFile(join(home, ".ssh", "config"));
	} catch {
		sshConfig = "";
	}

	await addSocket(parseIdentityAgent(sshConfig, home));

	for (const relativePath of ONEPASSWORD_SOCKETS) {
		await addSocket(join(home, relativePath));
	}

	await addSocket(deps.env("SSH_AUTH_SOCK"));

	return sockets;
}

export function parseIdentityAgent(
	sshConfig: string,
	homeDirectory: string,
): string | undefined {
	const lines = sshConfig.split("\n");
	let inGlobalOrWildcard = true;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		const hostMatch = line.match(/^host\s+(.+)$/i);
		if (hostMatch) {
			const patterns = hostMatch[1].trim().split(/\s+/);
			inGlobalOrWildcard = patterns.includes("*");
			continue;
		}

		const identityAgentMatch = line.match(/^identityagent\s+(.+)$/i);
		if (!inGlobalOrWildcard || !identityAgentMatch) {
			continue;
		}

		let agentPath = identityAgentMatch[1].trim().replace(/^['"]|['"]$/g, "");
		if (agentPath.startsWith("~/")) {
			agentPath = join(homeDirectory, agentPath.slice(2));
		}
		agentPath = agentPath.replace(/\\ /g, " ");

		return agentPath;
	}

	return undefined;
}

export async function discoverPrimaryAgentSocket(
	deps: AgentDiscoveryDeps = defaultDeps,
): Promise<string | undefined> {
	const sockets = await discoverAgentSockets(deps);
	return sockets[0];
}
