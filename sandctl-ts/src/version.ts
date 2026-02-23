declare const __SANDCTL_VERSION__: string | undefined;
declare const __SANDCTL_COMMIT__: string | undefined;
declare const __SANDCTL_BUILD_TIME__: string | undefined;

export const VERSION =
	typeof __SANDCTL_VERSION__ === "string" ? __SANDCTL_VERSION__ : "dev";

export const COMMIT =
	typeof __SANDCTL_COMMIT__ === "string" ? __SANDCTL_COMMIT__ : "unknown";

export const BUILD_TIME =
	typeof __SANDCTL_BUILD_TIME__ === "string"
		? __SANDCTL_BUILD_TIME__
		: "unknown";
