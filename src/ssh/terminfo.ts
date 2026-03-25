import { execFileSync } from "node:child_process";

import type { SSHClientLike } from "@/ssh/client";
import { exec, execWithStreams } from "@/ssh/exec";

/**
 * Well-known terminal types that are universally available and never need syncing.
 */
const WELL_KNOWN_TERMS = new Set([
	"xterm",
	"xterm-256color",
	"vt100",
	"vt220",
	"screen",
	"screen-256color",
	"tmux",
	"tmux-256color",
	"linux",
	"dumb",
]);

const FALLBACK_TERM = "xterm-256color";

/**
 * Ensure the remote host has a terminfo entry for the given TERM value.
 *
 * If the remote is missing the entry, this attempts to export the terminfo
 * from the local host and install it on the remote via `tic`. If anything
 * fails, it returns a safe fallback TERM value instead.
 *
 * @returns The TERM value to use for the remote session.
 */
export async function syncTerminfo(
	client: SSHClientLike,
	term: string,
): Promise<string> {
	if (!term || WELL_KNOWN_TERMS.has(term)) {
		return term || FALLBACK_TERM;
	}

	// Check if remote already has the terminfo
	const check = await exec(client, `infocmp ${term} > /dev/null 2>&1`);
	if (check.exitCode === 0) {
		return term;
	}

	// Try to export from local host and install on remote
	let localTerminfo: string;
	try {
		localTerminfo = execFileSync("infocmp", ["-x", term], {
			encoding: "utf8",
			timeout: 5_000,
		});
	} catch {
		return FALLBACK_TERM;
	}

	const install = await execWithStreams(client, "tic -x -", {
		stdin: localTerminfo,
	});

	if (install.exitCode !== 0) {
		return FALLBACK_TERM;
	}

	return term;
}
