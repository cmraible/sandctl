import { Command } from "commander";
import {
	assertRunnable,
	buildSSHOptions,
	CommandExitError,
	lookupSession,
	type SessionStoreLike,
	type SSHRuntimeClient,
	withSSHClient,
} from "@/commands/shared/session-runtime";
import { type Config, load } from "@/config/config";
import { SessionStore } from "@/session/store";
import {
	SSHClient,
	type SSHClientLike,
	type SSHClientOptions,
} from "@/ssh/client";
import {
	type ActiveTunnel,
	type ForwardSpec,
	openTunnels,
	parseForwardSpec,
} from "@/ssh/forward";

export { CommandExitError };

interface Dependencies {
	store: SessionStoreLike;
	loadConfig: (configPath?: string) => Promise<Config>;
	createSSHClient: (options: SSHClientOptions) => SSHRuntimeClient;
	openTunnels: (
		client: SSHClientLike,
		specs: ForwardSpec[],
	) => Promise<ActiveTunnel[]>;
	log: (message: string) => void;
	waitForSignal: () => Promise<void>;
}

const defaultDependencies: Dependencies = {
	store: new SessionStore(),
	loadConfig: load,
	createSSHClient: (options) => new SSHClient(options),
	openTunnels,
	log: (message) => console.log(message),
	waitForSignal: () =>
		new Promise<void>((resolve) => {
			process.once("SIGINT", () => resolve());
			process.once("SIGTERM", () => resolve());
		}),
};

export async function runForward(
	name: string,
	forwardSpecs: string[],
	deps: Partial<Dependencies> = {},
	configPath?: string,
): Promise<void> {
	const dependencies = {
		...defaultDependencies,
		...deps,
	};

	if (forwardSpecs.length === 0) {
		throw new CommandExitError("at least one -L forward spec is required", 1);
	}

	const specs = forwardSpecs.map(parseForwardSpec);

	const session = await lookupSession(name, dependencies.store);
	assertRunnable(session);

	const config = await dependencies.loadConfig(configPath);
	const client = dependencies.createSSHClient(
		buildSSHOptions(config, session.ip_address),
	);

	await withSSHClient(client, async (c) => {
		const tunnels = await dependencies.openTunnels(c, specs);

		for (const tunnel of tunnels) {
			dependencies.log(
				`Forwarding 127.0.0.1:${tunnel.spec.localPort} → ${tunnel.spec.remoteHost}:${tunnel.spec.remotePort}`,
			);
		}

		dependencies.log("Press Ctrl+C to stop forwarding.");

		await dependencies.waitForSignal();

		for (const tunnel of tunnels) {
			await tunnel.close().catch(() => {});
		}
	});
}

export function registerForwardCommand(): Command {
	return new Command("forward")
		.description("Forward local ports to a remote session via SSH tunnels")
		.argument("<name>", "Session name")
		.option(
			"-L <spec...>",
			"Forward specification: localPort:remoteHost:remotePort (repeatable)",
		)
		.action(
			async (name: string, options: { L?: string[] }, command: Command) => {
				const globals = command.optsWithGlobals() as { config?: string };
				await runForward(name, options.L ?? [], {}, globals.config);
			},
		);
}
