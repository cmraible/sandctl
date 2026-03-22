import type { Server, Socket } from "node:net";
import { createServer } from "node:net";

import type { SSHClientLike } from "@/ssh/client";

// ---------------------------------------------------------------------------
// Port-forward specification parsing
// ---------------------------------------------------------------------------

export interface ForwardSpec {
	localPort: number;
	remoteHost: string;
	remotePort: number;
}

/**
 * Parses a `-L` style forward spec: `localPort:remoteHost:remotePort`.
 *
 * Throws on invalid format or out-of-range port numbers.
 */
export function parseForwardSpec(spec: string): ForwardSpec {
	const parts = spec.split(":");
	if (parts.length !== 3) {
		throw new Error(
			`invalid forward spec '${spec}': expected localPort:remoteHost:remotePort`,
		);
	}

	const [localPortStr, remoteHost, remotePortStr] = parts;

	const localPort = Number(localPortStr);
	const remotePort = Number(remotePortStr);

	if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
		throw new Error(
			`invalid local port '${localPortStr}': must be an integer between 1 and 65535`,
		);
	}

	if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) {
		throw new Error(
			`invalid remote port '${remotePortStr}': must be an integer between 1 and 65535`,
		);
	}

	if (remoteHost.length === 0) {
		throw new Error("remote host must not be empty");
	}

	return { localPort, remoteHost, remotePort };
}

// ---------------------------------------------------------------------------
// Tunnel
// ---------------------------------------------------------------------------

export interface TunnelDeps {
	createTCPServer: (onConnection: (socket: Socket) => void) => Server;
}

const defaultTunnelDeps: TunnelDeps = {
	createTCPServer: (onConnection) => createServer(onConnection),
};

export interface ActiveTunnel {
	spec: ForwardSpec;
	server: Server;
	close(): Promise<void>;
}

/**
 * Opens a local TCP server on `spec.localPort` that tunnels each incoming
 * connection through the SSH client to `spec.remoteHost:spec.remotePort`.
 */
export async function openTunnel(
	client: SSHClientLike,
	spec: ForwardSpec,
	deps: TunnelDeps = defaultTunnelDeps,
): Promise<ActiveTunnel> {
	const sockets = new Set<Socket>();

	const server = deps.createTCPServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));

		client
			.forwardOut("127.0.0.1", spec.localPort, spec.remoteHost, spec.remotePort)
			.then((channel) => {
				socket.pipe(channel).pipe(socket);
				channel.on("close", () => socket.destroy());
				socket.on("close", () => (channel as unknown as Socket).destroy?.());
			})
			.catch(() => {
				socket.destroy();
			});
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(spec.localPort, "127.0.0.1", () => {
			server.removeListener("error", reject);
			resolve();
		});
	});

	return {
		spec,
		server,
		async close() {
			for (const s of sockets) {
				s.destroy();
			}
			sockets.clear();
			await new Promise<void>((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()));
			});
		},
	};
}

/**
 * Opens multiple tunnels and returns a cleanup function that closes all of them.
 */
export async function openTunnels(
	client: SSHClientLike,
	specs: ForwardSpec[],
	deps?: TunnelDeps,
): Promise<ActiveTunnel[]> {
	const tunnels: ActiveTunnel[] = [];
	try {
		for (const spec of specs) {
			tunnels.push(await openTunnel(client, spec, deps));
		}
		return tunnels;
	} catch (error) {
		// Clean up any tunnels that were already opened
		for (const tunnel of tunnels) {
			await tunnel.close().catch(() => {});
		}
		throw error;
	}
}
