import type { SSHClientLike, SSHShellChannelLike } from "@/ssh/client";

export interface ConsoleOptions {
	term?: string;
	cols?: number;
	rows?: number;
}

export interface ConsoleRuntime {
	stdin: NodeJS.ReadStream & {
		isTTY?: boolean;
		isRaw?: boolean;
		setRawMode?(raw: boolean): void;
	};
	stdout: NodeJS.WriteStream & {
		columns?: number;
		rows?: number;
	};
	stderr: NodeJS.WriteStream;
	term?: string;
}

const defaultRuntime: ConsoleRuntime = {
	stdin: process.stdin,
	stdout: process.stdout,
	stderr: process.stderr,
	term: process.env.TERM,
};

export async function openConsole(
	client: SSHClientLike,
	options: ConsoleOptions = {},
	runtime: ConsoleRuntime = defaultRuntime,
): Promise<void> {
	if (!runtime.stdin.isTTY) {
		throw new Error("console requires an interactive terminal");
	}

	const requestedTerm = options.term ?? runtime.term;
	const term =
		typeof requestedTerm === "string" && requestedTerm.length > 0
			? requestedTerm
			: "xterm-256color";

	const shell = await client.shell({
		term,
		cols: options.cols ?? runtime.stdout.columns ?? 80,
		rows: options.rows ?? runtime.stdout.rows ?? 24,
	});

	await runInteractiveSession(shell, runtime);
}

async function runInteractiveSession(
	channel: SSHShellChannelLike,
	runtime: ConsoleRuntime,
): Promise<void> {
	const previousRaw = runtime.stdin.isRaw ?? false;
	const onResize = (): void => {
		const rows = Math.max(1, runtime.stdout.rows ?? 24);
		const cols = Math.max(1, runtime.stdout.columns ?? 80);

		channel.setWindow(rows, cols, 0, 0);
	};

	runtime.stdin.setRawMode?.(true);
	runtime.stdin.resume();
	runtime.stdin.pipe(channel);
	channel.pipe(runtime.stdout);
	channel.stderr.pipe(runtime.stderr);
	runtime.stdout.on("resize", onResize);

	try {
		await new Promise<void>((resolve, reject) => {
			const onClose = (): void => {
				channel.off("error", onError);
				resolve();
			};
			const onError = (error: unknown): void => {
				channel.off("close", onClose);
				reject(error instanceof Error ? error : new Error(String(error)));
			};

			channel.once("close", onClose);
			channel.once("error", onError);
		});
	} finally {
		runtime.stdin.unpipe(channel);
		channel.stderr.unpipe(runtime.stderr);
		runtime.stdout.off("resize", onResize);
		runtime.stdin.setRawMode?.(previousRaw);
		runtime.stdin.pause();
	}
}
