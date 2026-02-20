import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import {
	age,
	Duration,
	isActive,
	isTerminal,
	type Session,
	timeoutRemaining,
} from "@/session/types";

describe("session/types", () => {
	const now = Date.parse("2026-02-20T01:00:00Z");
	let dateNowSpy: ReturnType<typeof spyOn>;

	const session: Session = {
		id: "alice",
		status: "running",
		provider: "hetzner",
		provider_id: "123",
		ip_address: "1.2.3.4",
		created_at: "2026-02-20T00:00:00Z",
		timeout: "2h0m0s",
	};

	beforeEach(() => {
		dateNowSpy = spyOn(Date, "now").mockReturnValue(now);
	});

	afterEach(() => {
		dateNowSpy.mockRestore();
	});

	test("isActive returns true for provisioning and running", () => {
		expect(isActive({ ...session, status: "provisioning" })).toBeTrue();
		expect(isActive({ ...session, status: "running" })).toBeTrue();
		expect(isActive({ ...session, status: "failed" })).toBeFalse();
	});

	test("isTerminal returns true for stopped and failed", () => {
		expect(isTerminal({ ...session, status: "stopped" })).toBeTrue();
		expect(isTerminal({ ...session, status: "failed" })).toBeTrue();
		expect(isTerminal({ ...session, status: "running" })).toBeFalse();
	});

	test("timeoutRemaining calculates correctly for active timeouts", () => {
		expect(timeoutRemaining(session)).toBe(60 * 60 * 1000);
	});

	test("timeoutRemaining returns null when no timeout set", () => {
		expect(timeoutRemaining({ ...session, timeout: undefined })).toBeNull();
	});

	test("age returns milliseconds since created_at", () => {
		expect(age(session)).toBe(60 * 60 * 1000);
	});

	test("duration serialization matches Go format", () => {
		const oneHour = JSON.parse(
			JSON.stringify(new Duration(60 * 60 * 1000)),
		) as string;
		expect(Duration.parse(oneHour).milliseconds).toBe(60 * 60 * 1000);

		const thirtyMinutes = JSON.parse(
			JSON.stringify(new Duration(30 * 60 * 1000)),
		) as string;
		expect(Duration.parse(thirtyMinutes).milliseconds).toBe(30 * 60 * 1000);
	});
});
