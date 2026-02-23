/**
 * Shared test fixtures reused across multiple test files.
 *
 * Only extract fixtures that appear in 2+ files verbatim — YAGNI.
 */

import type { Config } from "@/config/config";
import type { Session } from "@/session/types";

// ---------------------------------------------------------------------------
// Session fixtures
// ---------------------------------------------------------------------------

/**
 * A minimal running session with all required fields set.
 * Used as a base for session-level tests and command tests that need a
 * session in "running" state with a reachable IP.
 */
export function makeRunningSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "alice",
		status: "running",
		provider: "hetzner",
		provider_id: "vm-123",
		ip_address: "203.0.113.10",
		created_at: "2026-02-20T00:00:00Z",
		...overrides,
	};
}

/**
 * A full running session suitable for store-level tests (includes timeout).
 */
export const baseSession: Session = {
	id: "alice",
	status: "running",
	provider: "hetzner",
	provider_id: "123",
	ip_address: "1.2.3.4",
	created_at: "2026-02-20T00:00:00Z",
	timeout: "1h0m0s",
};

// ---------------------------------------------------------------------------
// Config fixtures
// ---------------------------------------------------------------------------

/**
 * A complete Hetzner provider config suitable for commands/new tests.
 */
export const baseProviderConfig: Config = {
	default_provider: "hetzner",
	ssh_public_key: "~/.ssh/id_ed25519.pub",
	providers: {
		hetzner: {
			token: "token",
			region: "ash",
			server_type: "cpx31",
			image: "ubuntu-24.04",
		},
	},
};

/**
 * An agent-mode config for SSH agent tests.
 */
export const agentModeConfig: Config = {
	default_provider: "hetzner",
	ssh_key_source: "agent",
	ssh_public_key_inline: "ssh-ed25519 AAAA test@local",
};
