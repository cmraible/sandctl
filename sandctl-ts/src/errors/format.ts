import type { ZodError } from "zod";

/**
 * Formats a ZodError into a concise human-readable string.
 *
 * Shows up to 5 validation issues in "path: message" format, separated by
 * semicolons. Appends "(+N more)" when additional issues are truncated.
 */
export function formatZodError(error: ZodError): string {
	const maxIssues = 5;
	const issues = error.issues.slice(0, maxIssues).map((issue) => {
		const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
		return `${path}: ${issue.message}`;
	});
	const remainder = error.issues.length - issues.length;
	const suffix = remainder > 0 ? ` (+${remainder} more)` : "";
	return `${issues.join("; ")}${suffix}`;
}
