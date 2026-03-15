import { describe, expect, test } from "bun:test";

import { runLogs } from "@/commands/logs";
import { agentModeConfig, makeRunningSession } from "../../support/fixtures";

describe("commands/logs", () => {
	test("runs cat on cloud-init log by default", async () => {
		const commands: string[] = [];
		let output = "";

		await runLogs(
			"alice",
			{},
			{
				store: {
					get: async () => makeRunningSession(),
				},
				loadConfig: async () => agentModeConfig,
				createSSHClient: () => ({
					connect: async () => {},
					close: async () => {},
					exec: async () => {
						throw new Error("not used");
					},
					shell: async () => {
						throw new Error("not used");
					},
				}),
				runCommand: async (_client, command) => {
					commands.push(command);
					return {
						stdout: "cloud-init log output\n",
						stderr: "",
						exitCode: 0,
					};
				},
				runStreamingCommand: async () => ({
					stdout: "",
					stderr: "",
					exitCode: 0,
				}),
				stdout: {
					write(chunk: string | Uint8Array) {
						output += chunk.toString();
						return true;
					},
				},
				stderr: {
					write() {
						return true;
					},
				},
			},
		);

		expect(commands).toEqual(["cat /var/log/cloud-init-output.log"]);
		expect(output).toBe("cloud-init log output\n");
	});

	test("uses tail -n when --lines is specified", async () => {
		const commands: string[] = [];

		await runLogs(
			"alice",
			{ lines: "50" },
			{
				store: {
					get: async () => makeRunningSession(),
				},
				loadConfig: async () => agentModeConfig,
				createSSHClient: () => ({
					connect: async () => {},
					close: async () => {},
					exec: async () => {
						throw new Error("not used");
					},
					shell: async () => {
						throw new Error("not used");
					},
				}),
				runCommand: async (_client, command) => {
					commands.push(command);
					return { stdout: "", stderr: "", exitCode: 0 };
				},
				runStreamingCommand: async () => ({
					stdout: "",
					stderr: "",
					exitCode: 0,
				}),
				stdout: {
					write() {
						return true;
					},
				},
				stderr: {
					write() {
						return true;
					},
				},
			},
		);

		expect(commands).toEqual(["tail -n 50 /var/log/cloud-init-output.log"]);
	});

	test("uses tail -f when --follow is specified", async () => {
		const streamCommands: string[] = [];

		await runLogs(
			"alice",
			{ follow: true },
			{
				store: {
					get: async () => makeRunningSession(),
				},
				loadConfig: async () => agentModeConfig,
				createSSHClient: () => ({
					connect: async () => {},
					close: async () => {},
					exec: async () => {
						throw new Error("not used");
					},
					shell: async () => {
						throw new Error("not used");
					},
				}),
				runCommand: async () => ({
					stdout: "",
					stderr: "",
					exitCode: 0,
				}),
				runStreamingCommand: async (_client, command) => {
					streamCommands.push(command);
					return { stdout: "", stderr: "", exitCode: 0 };
				},
				stdout: {
					write() {
						return true;
					},
				},
				stderr: {
					write() {
						return true;
					},
				},
			},
		);

		expect(streamCommands).toEqual([
			"tail -n 10 -f /var/log/cloud-init-output.log",
		]);
	});

	test("combines --follow and --lines", async () => {
		const streamCommands: string[] = [];

		await runLogs(
			"alice",
			{ follow: true, lines: "100" },
			{
				store: {
					get: async () => makeRunningSession(),
				},
				loadConfig: async () => agentModeConfig,
				createSSHClient: () => ({
					connect: async () => {},
					close: async () => {},
					exec: async () => {
						throw new Error("not used");
					},
					shell: async () => {
						throw new Error("not used");
					},
				}),
				runCommand: async () => ({
					stdout: "",
					stderr: "",
					exitCode: 0,
				}),
				runStreamingCommand: async (_client, command) => {
					streamCommands.push(command);
					return { stdout: "", stderr: "", exitCode: 0 };
				},
				stdout: {
					write() {
						return true;
					},
				},
				stderr: {
					write() {
						return true;
					},
				},
			},
		);

		expect(streamCommands).toEqual([
			"tail -n 100 -f /var/log/cloud-init-output.log",
		]);
	});

	test("rejects with exit code 5 when session is not running", async () => {
		await expect(
			runLogs(
				"alice",
				{},
				{
					store: {
						get: async () => makeRunningSession({ status: "failed" }),
					},
				},
			),
		).rejects.toMatchObject({
			exitCode: 5,
		});
	});

	test("normalizes session name", async () => {
		let lookedUp = "";

		await runLogs(
			"Alice",
			{},
			{
				store: {
					get: async (id: string) => {
						lookedUp = id;
						return makeRunningSession();
					},
				},
				loadConfig: async () => agentModeConfig,
				createSSHClient: () => ({
					connect: async () => {},
					close: async () => {},
					exec: async () => {
						throw new Error("not used");
					},
					shell: async () => {
						throw new Error("not used");
					},
				}),
				runCommand: async () => ({
					stdout: "",
					stderr: "",
					exitCode: 0,
				}),
				runStreamingCommand: async () => ({
					stdout: "",
					stderr: "",
					exitCode: 0,
				}),
				stdout: {
					write() {
						return true;
					},
				},
				stderr: {
					write() {
						return true;
					},
				},
			},
		);

		expect(lookedUp).toBe("alice");
	});

	test("returns non-zero exit code on command failure", async () => {
		const result = await runLogs(
			"alice",
			{},
			{
				store: {
					get: async () => makeRunningSession(),
				},
				loadConfig: async () => agentModeConfig,
				createSSHClient: () => ({
					connect: async () => {},
					close: async () => {},
					exec: async () => {
						throw new Error("not used");
					},
					shell: async () => {
						throw new Error("not used");
					},
				}),
				runCommand: async () => ({
					stdout: "",
					stderr:
						"cat: /var/log/cloud-init-output.log: No such file or directory\n",
					exitCode: 1,
				}),
				runStreamingCommand: async () => ({
					stdout: "",
					stderr: "",
					exitCode: 0,
				}),
				stdout: {
					write() {
						return true;
					},
				},
				stderr: {
					write() {
						return true;
					},
				},
			},
		);

		expect(result.exitCode).toBe(1);
	});
});
