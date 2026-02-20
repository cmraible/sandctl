import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";

import type { Config } from "@/config/config";

function omitUndefined(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(omitUndefined);
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).flatMap(([key, nested]) =>
				nested === undefined ? [] : [[key, omitUndefined(nested)]],
			),
		);
	}

	return value;
}

export async function save(configPath: string, config: Config): Promise<void> {
	const dir = path.dirname(configPath);
	await mkdir(dir, { recursive: true, mode: 0o700 });
	await chmod(dir, 0o700);

	const tmpPath = path.join(
		dir,
		`.config.tmp.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`,
	);
	const serialized = stringify(omitUndefined(config), {
		defaultStringType: "PLAIN",
	});

	await writeFile(tmpPath, serialized, { mode: 0o600 });
	await chmod(tmpPath, 0o600);
	await rename(tmpPath, configPath);
}
