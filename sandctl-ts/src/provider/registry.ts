import type { ProviderConfig } from "@/config/config";
import { HetznerProvider } from "@/hetzner/provider";
import { ErrUnknownProvider } from "@/provider/errors";
import type { Provider, SSHKeyManager } from "@/provider/interface";

export { ErrUnknownProvider } from "@/provider/errors";

export type ProviderFactory = (
	config: ProviderConfig,
) => Provider & SSHKeyManager;

const providers = new Map<string, ProviderFactory>();
let builtinsRegistered = false;

export function register(name: string, factory: ProviderFactory): void {
	providers.set(name, factory);
}

export function get(
	name: string,
	config: ProviderConfig,
): Provider & SSHKeyManager {
	const factory = providers.get(name);
	if (!factory) {
		throw new ErrUnknownProvider(name);
	}
	return factory(config);
}

export function available(): string[] {
	return [...providers.keys()];
}

export function clearRegistry(): void {
	providers.clear();
	builtinsRegistered = false;
}

export function registerBuiltinProviders(): void {
	if (builtinsRegistered) {
		return;
	}

	register("hetzner", (config) => new HetznerProvider(config));
	builtinsRegistered = true;
}

registerBuiltinProviders();
