import { describe, expect, test } from "bun:test";

import {
	type CpDependencies,
	parseTarget,
	resolveDirection,
	runCp,
} from "@/commands/cp";
import type { Config } from "@/config/config";
import type { SFTPWrapperLike } from "@/ssh/client";
import { makeRunningSession } from "../../support/fixtures";

const FILE_MODE_CONFIG: Config = {
	default_provider: "hetzner",
	ssh_public_key: "~/.ssh/id_ed25519.pub",
};

function makeMockSSHClient(events: string[]) {
	return {
		connect: async () => {
			events.push("client.connect");
		},
		close: async () => {
			events.push("client.close");
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
}

function makeMockSFTP(): SFTPWrapperLike {
	return {
		fastPut: (_l, _r, _o, cb) => cb(),
		fastGet: (_r, _l, _o, cb) => cb(),
		readdir: (_p, cb) => cb(undefined, []),
		stat: (_p, cb) =>
			cb(undefined, {
				isDirectory: () => false,
				isFile: () => true,
				size: 100,
			}),
		mkdir: (_p, cb) => cb(),
		end: () => {},
	};
}

function makeBaseDeps(
	overrides: Partial<CpDependencies> = {},
): Partial<CpDependencies> {
	const events: string[] = [];
	return {
		store: {
			get: async () => makeRunningSession(),
		},
		loadConfig: async () => FILE_MODE_CONFIG,
		createSSHClient: () => makeMockSSHClient(events),
		openSFTP: async () => makeMockSFTP(),
		localStat: async () => ({ isDirectory: false }),
		remoteStat: async () => ({ isDirectory: false, size: 100 }),
		uploadFile: async () => ({ filesTransferred: 1, bytesTransferred: 100 }),
		uploadDirectory: async () => ({
			filesTransferred: 3,
			bytesTransferred: 300,
		}),
		downloadFile: async () => ({
			filesTransferred: 1,
			bytesTransferred: 200,
		}),
		downloadDirectory: async () => ({
			filesTransferred: 5,
			bytesTransferred: 500,
		}),
		stdout: { write: () => true },
		stderr: { write: () => true },
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

describe("parseTarget", () => {
	test("parses a local path", () => {
		expect(parseTarget("./file.txt")).toEqual({
			kind: "local",
			path: "./file.txt",
		});
	});

	test("parses a remote path with session prefix", () => {
		expect(parseTarget("mysession:/home/agent/file.txt")).toEqual({
			kind: "remote",
			session: "mysession",
			path: "/home/agent/file.txt",
		});
	});

	test("treats path starting with colon as local", () => {
		expect(parseTarget(":/some/path")).toEqual({
			kind: "local",
			path: ":/some/path",
		});
	});

	test("handles relative remote paths", () => {
		expect(parseTarget("alice:file.txt")).toEqual({
			kind: "remote",
			session: "alice",
			path: "file.txt",
		});
	});
});

describe("resolveDirection", () => {
	test("local source + remote dest = upload", () => {
		const result = resolveDirection(
			{ kind: "local", path: "./file.txt" },
			{ kind: "remote", session: "alice", path: "/tmp/file.txt" },
		);
		expect(result).toEqual({
			direction: "upload",
			local: "./file.txt",
			remote: { session: "alice", path: "/tmp/file.txt" },
		});
	});

	test("remote source + local dest = download", () => {
		const result = resolveDirection(
			{ kind: "remote", session: "alice", path: "/tmp/file.txt" },
			{ kind: "local", path: "./file.txt" },
		);
		expect(result).toEqual({
			direction: "download",
			remote: { session: "alice", path: "/tmp/file.txt" },
			local: "./file.txt",
		});
	});

	test("remote-to-remote throws", () => {
		expect(() =>
			resolveDirection(
				{ kind: "remote", session: "alice", path: "/a" },
				{ kind: "remote", session: "bob", path: "/b" },
			),
		).toThrow("Remote-to-remote copy is not supported");
	});

	test("local-to-local throws", () => {
		expect(() =>
			resolveDirection(
				{ kind: "local", path: "/a" },
				{ kind: "local", path: "/b" },
			),
		).toThrow("Both source and destination are local");
	});
});

// ---------------------------------------------------------------------------
// runCp – upload
// ---------------------------------------------------------------------------

describe("commands/cp – upload", () => {
	test("uploads a single file", async () => {
		const events: string[] = [];
		const result = await runCp(
			"./local.txt",
			"alice:/remote.txt",
			{},
			makeBaseDeps({
				uploadFile: async (_sftp, local, remote) => {
					events.push(`upload:${local}→${remote}`);
					return { filesTransferred: 1, bytesTransferred: 42 };
				},
			}),
		);

		expect(result).toEqual({ filesTransferred: 1, bytesTransferred: 42 });
		expect(events).toContain("upload:./local.txt→/remote.txt");
	});

	test("uploads a directory with -r", async () => {
		const events: string[] = [];
		const result = await runCp(
			"./mydir",
			"alice:/remote/mydir",
			{ recursive: true },
			makeBaseDeps({
				localStat: async () => ({ isDirectory: true }),
				uploadDirectory: async (_sftp, local, remote) => {
					events.push(`upload-dir:${local}→${remote}`);
					return { filesTransferred: 5, bytesTransferred: 500 };
				},
			}),
		);

		expect(result).toEqual({ filesTransferred: 5, bytesTransferred: 500 });
		expect(events).toContain("upload-dir:./mydir→/remote/mydir");
	});

	test("rejects directory upload without -r", async () => {
		await expect(
			runCp(
				"./mydir",
				"alice:/remote/mydir",
				{},
				makeBaseDeps({
					localStat: async () => ({ isDirectory: true }),
				}),
			),
		).rejects.toThrow("is a directory. Use -r to copy directories");
	});
});

// ---------------------------------------------------------------------------
// runCp – download
// ---------------------------------------------------------------------------

describe("commands/cp – download", () => {
	test("downloads a single file", async () => {
		const events: string[] = [];
		const result = await runCp(
			"alice:/remote/file.txt",
			"./local.txt",
			{},
			makeBaseDeps({
				remoteStat: async () => ({ isDirectory: false, size: 200 }),
				downloadFile: async (_sftp, remote, local) => {
					events.push(`download:${remote}→${local}`);
					return { filesTransferred: 1, bytesTransferred: 200 };
				},
			}),
		);

		expect(result).toEqual({ filesTransferred: 1, bytesTransferred: 200 });
		expect(events).toContain("download:/remote/file.txt→./local.txt");
	});

	test("downloads a directory with -r", async () => {
		const events: string[] = [];
		const result = await runCp(
			"alice:/remote/dir",
			"./local-dir",
			{ recursive: true },
			makeBaseDeps({
				remoteStat: async () => ({ isDirectory: true, size: 0 }),
				downloadDirectory: async (_sftp, remote, local) => {
					events.push(`download-dir:${remote}→${local}`);
					return { filesTransferred: 10, bytesTransferred: 1024 };
				},
			}),
		);

		expect(result).toEqual({
			filesTransferred: 10,
			bytesTransferred: 1024,
		});
		expect(events).toContain("download-dir:/remote/dir→./local-dir");
	});

	test("rejects directory download without -r", async () => {
		await expect(
			runCp(
				"alice:/remote/dir",
				"./local-dir",
				{},
				makeBaseDeps({
					remoteStat: async () => ({ isDirectory: true, size: 0 }),
				}),
			),
		).rejects.toThrow("is a directory. Use -r to copy directories");
	});

	test("throws when remote path not found", async () => {
		await expect(
			runCp(
				"alice:/nonexistent",
				"./local.txt",
				{},
				makeBaseDeps({
					remoteStat: async () => {
						throw new Error("No such file");
					},
				}),
			),
		).rejects.toThrow("Remote path '/nonexistent' not found");
	});
});

// ---------------------------------------------------------------------------
// runCp – error handling
// ---------------------------------------------------------------------------

describe("commands/cp – error handling", () => {
	test("rejects when session is not running", async () => {
		await expect(
			runCp(
				"./file.txt",
				"alice:/remote.txt",
				{},
				makeBaseDeps({
					store: {
						get: async () => makeRunningSession({ status: "stopped" }),
					},
				}),
			),
		).rejects.toMatchObject({ exitCode: 5 });
	});

	test("rejects when session is not found", async () => {
		const { NotFoundError } = await import("@/session/types");
		await expect(
			runCp(
				"./file.txt",
				"alice:/remote.txt",
				{},
				makeBaseDeps({
					store: {
						get: async () => {
							throw new NotFoundError("alice");
						},
					},
				}),
			),
		).rejects.toMatchObject({ exitCode: 4 });
	});

	test("closes SSH client when SFTP transfer throws", async () => {
		const events: string[] = [];
		await expect(
			runCp(
				"./file.txt",
				"alice:/remote.txt",
				{},
				makeBaseDeps({
					createSSHClient: () => makeMockSSHClient(events),
					uploadFile: async () => {
						throw new Error("transfer failed");
					},
				}),
			),
		).rejects.toThrow("transfer failed");

		expect(events).toContain("client.connect");
		expect(events).toContain("client.close");
	});
});
