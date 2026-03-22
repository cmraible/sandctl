import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import {
	type ForwardSpec,
	openTunnel,
	openTunnels,
	parseForwardSpec,
} from "@/ssh/forward";

// ---------------------------------------------------------------------------
// parseForwardSpec
// ---------------------------------------------------------------------------

describe("parseForwardSpec", () => {
	test("parses a valid spec", () => {
		expect(parseForwardSpec("8080:localhost:80")).toEqual({
			localPort: 8080,
			remoteHost: "localhost",
			remotePort: 80,
		});
	});

	test("parses spec with IP address as remote host", () => {
		expect(parseForwardSpec("3000:10.0.0.1:443")).toEqual({
			localPort: 3000,
			remoteHost: "10.0.0.1",
			remotePort: 443,
		});
	});

	test("rejects spec with wrong number of parts", () => {
		expect(() => parseForwardSpec("8080:localhost")).toThrow(
			"invalid forward spec",
		);
	});

	test("rejects spec with too many parts", () => {
		expect(() => parseForwardSpec("8080:localhost:80:extra")).toThrow(
			"invalid forward spec",
		);
	});

	test("rejects non-integer local port", () => {
		expect(() => parseForwardSpec("abc:localhost:80")).toThrow(
			"invalid local port",
		);
	});

	test("rejects local port out of range (0)", () => {
		expect(() => parseForwardSpec("0:localhost:80")).toThrow(
			"invalid local port",
		);
	});

	test("rejects local port out of range (65536)", () => {
		expect(() => parseForwardSpec("65536:localhost:80")).toThrow(
			"invalid local port",
		);
	});

	test("rejects non-integer remote port", () => {
		expect(() => parseForwardSpec("8080:localhost:abc")).toThrow(
			"invalid remote port",
		);
	});

	test("rejects remote port out of range", () => {
		expect(() => parseForwardSpec("8080:localhost:0")).toThrow(
			"invalid remote port",
		);
	});

	test("rejects empty remote host", () => {
		expect(() => parseForwardSpec("8080::80")).toThrow(
			"remote host must not be empty",
		);
	});
});

// ---------------------------------------------------------------------------
// openTunnel
// ---------------------------------------------------------------------------

describe("openTunnel", () => {
	function makeFakeServer() {
		let connectionHandler: ((socket: unknown) => void) | undefined;
		let listeningPort: number | undefined;
		let listeningHost: string | undefined;
		const emitter = new EventEmitter();
		let closed = false;

		const server = {
			listen(port: number, host: string, cb: () => void) {
				listeningPort = port;
				listeningHost = host;
				cb();
			},
			close(cb: (err?: Error) => void) {
				closed = true;
				cb();
			},
			once: emitter.once.bind(emitter),
			removeListener: emitter.removeListener.bind(emitter),
			get listeningPort() {
				return listeningPort;
			},
			get listeningHost() {
				return listeningHost;
			},
			get closed() {
				return closed;
			},
			simulateConnection(socket: unknown) {
				connectionHandler?.(socket);
			},
		};

		const deps = {
			createTCPServer: (onConnection: (socket: unknown) => void) => {
				connectionHandler = onConnection;
				return server as never;
			},
		};

		return { server, deps };
	}

	function makeFakeClient() {
		const channels: EventEmitter[] = [];
		return {
			forwardOut: async () => {
				const channel = new EventEmitter();
				(channel as Record<string, unknown>).pipe = () => channel;
				channels.push(channel);
				return channel as never;
			},
			exec: async () => {
				throw new Error("not used");
			},
			shell: async () => {
				throw new Error("not used");
			},
			sftp: async () => {
				throw new Error("not used");
			},
			channels,
		};
	}

	test("opens a local TCP server on the specified port", async () => {
		const { server, deps } = makeFakeServer();
		const client = makeFakeClient();
		const spec: ForwardSpec = {
			localPort: 9090,
			remoteHost: "localhost",
			remotePort: 80,
		};

		const tunnel = await openTunnel(client, spec, deps);

		expect(server.listeningPort).toBe(9090);
		expect(server.listeningHost).toBe("127.0.0.1");
		expect(tunnel.spec).toEqual(spec);

		await tunnel.close();
		expect(server.closed).toBe(true);
	});

	test("tunnels incoming connections through SSH forwardOut", async () => {
		const { deps } = makeFakeServer();
		const forwardCalls: Array<{
			srcIP: string;
			srcPort: number;
			dstIP: string;
			dstPort: number;
		}> = [];

		const client = {
			forwardOut: async (
				srcIP: string,
				srcPort: number,
				dstIP: string,
				dstPort: number,
			) => {
				forwardCalls.push({ srcIP, srcPort, dstIP, dstPort });
				const channel = new EventEmitter();
				(channel as Record<string, unknown>).pipe = () => channel;
				return channel as never;
			},
			exec: async () => {
				throw new Error("not used");
			},
			shell: async () => {
				throw new Error("not used");
			},
			sftp: async () => {
				throw new Error("not used");
			},
		};

		const spec: ForwardSpec = {
			localPort: 9091,
			remoteHost: "db.internal",
			remotePort: 5432,
		};

		const tunnel = await openTunnel(client, spec, deps);

		// Simulate a TCP connection
		const fakeSocket = new EventEmitter();
		(fakeSocket as Record<string, unknown>).pipe = () => fakeSocket;
		(fakeSocket as Record<string, unknown>).destroy = () => {};
		(deps.createTCPServer as unknown as { handler: (s: unknown) => void })
			.handler;

		// The server's connection handler was captured during createTCPServer
		// We need to trigger it via the server object
		// Since we captured it via deps.createTCPServer, let's use the server reference
		// Actually we need to trigger the connection handler from the fake server
		// Let's restructure — use the captured reference
		const { server: server2, deps: deps2 } = makeFakeServerWithHandler();

		const tunnel2 = await openTunnel(client, spec, deps2);
		server2.triggerConnection(fakeSocket);

		// Wait a tick for the async forwardOut to complete
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(forwardCalls).toHaveLength(1);
		expect(forwardCalls[0]).toEqual({
			srcIP: "127.0.0.1",
			srcPort: 9091,
			dstIP: "db.internal",
			dstPort: 5432,
		});

		await tunnel.close();
		await tunnel2.close();
	});

	test("propagates listen errors (e.g. port in use)", async () => {
		const emitter = new EventEmitter();
		const deps = {
			createTCPServer: () => {
				const server = {
					listen(_port: number, _host: string, _cb: () => void) {
						// Don't call cb, emit error instead
						emitter.emit("error", new Error("EADDRINUSE"));
					},
					close(cb: (err?: Error) => void) {
						cb();
					},
					once: emitter.once.bind(emitter),
					removeListener: emitter.removeListener.bind(emitter),
				};
				return server as never;
			},
		};

		const client = makeFakeClient();
		const spec: ForwardSpec = {
			localPort: 9092,
			remoteHost: "localhost",
			remotePort: 80,
		};

		await expect(openTunnel(client, spec, deps)).rejects.toThrow("EADDRINUSE");
	});
});

function makeFakeServerWithHandler() {
	let connectionHandler: ((socket: unknown) => void) | undefined;
	const emitter = new EventEmitter();
	let closed = false;

	const server = {
		listen(_port: number, _host: string, cb: () => void) {
			cb();
		},
		close(cb: (err?: Error) => void) {
			closed = true;
			cb();
		},
		once: emitter.once.bind(emitter),
		removeListener: emitter.removeListener.bind(emitter),
		get closed() {
			return closed;
		},
		triggerConnection(socket: unknown) {
			connectionHandler?.(socket);
		},
	};

	const deps = {
		createTCPServer: (onConnection: (socket: unknown) => void) => {
			connectionHandler = onConnection;
			return server as never;
		},
	};

	return { server, deps };
}

// ---------------------------------------------------------------------------
// openTunnels
// ---------------------------------------------------------------------------

describe("openTunnels", () => {
	test("cleans up opened tunnels when a later tunnel fails", async () => {
		let tunnelCount = 0;
		const closedTunnels: number[] = [];

		const emitter = new EventEmitter();

		const deps = {
			createTCPServer: () => {
				tunnelCount++;
				const current = tunnelCount;

				if (current === 2) {
					// Second tunnel will fail
					const server = {
						listen(_port: number, _host: string, _cb: () => void) {
							emitter.emit(`error-${current}`, new Error("EADDRINUSE"));
						},
						close(cb: (err?: Error) => void) {
							closedTunnels.push(current);
							cb();
						},
						once(_event: string, listener: (...args: unknown[]) => void) {
							emitter.once(`error-${current}`, listener);
							return server;
						},
						removeListener(
							_event: string,
							listener: (...args: unknown[]) => void,
						) {
							emitter.removeListener(`error-${current}`, listener);
							return server;
						},
					};
					return server as never;
				}

				const server = {
					listen(_port: number, _host: string, cb: () => void) {
						cb();
					},
					close(cb: (err?: Error) => void) {
						closedTunnels.push(current);
						cb();
					},
					once: emitter.once.bind(emitter),
					removeListener: emitter.removeListener.bind(emitter),
				};
				return server as never;
			},
		};

		const client = {
			forwardOut: async () => {
				throw new Error("not used in this test");
			},
			exec: async () => {
				throw new Error("not used");
			},
			shell: async () => {
				throw new Error("not used");
			},
			sftp: async () => {
				throw new Error("not used");
			},
		};

		const specs: ForwardSpec[] = [
			{ localPort: 8080, remoteHost: "localhost", remotePort: 80 },
			{ localPort: 8081, remoteHost: "localhost", remotePort: 81 },
		];

		await expect(openTunnels(client, specs, deps)).rejects.toThrow(
			"EADDRINUSE",
		);

		// First tunnel should have been cleaned up
		expect(closedTunnels).toContain(1);
	});
});
