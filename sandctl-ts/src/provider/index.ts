export {
	ErrAuthFailed,
	ErrNotFound,
	ErrProvisionFailed,
	ErrQuotaExceeded,
	ErrTimeout,
	ErrUnknownProvider,
	ErrVMNotFound,
	ErrVMNotFound as VMNotFoundError,
} from "@/provider/errors";
export type { Provider, SSHKeyManager } from "@/provider/interface";
export {
	available,
	clearRegistry,
	get,
	type ProviderFactory,
	register,
} from "@/provider/registry";
export type { CreateOpts, VM, VMStatus } from "@/provider/types";

export interface LegacyVM {
	id: string;
	status: import("@/provider/types").VMStatus;
	ip_address?: string;
}

export interface LegacyProvider {
	getVM(providerId: string): Promise<LegacyVM>;
	deleteVM(providerId: string): Promise<void>;
}

const legacyProviders = new Map<string, LegacyProvider>();

export function registerProvider(name: string, provider: LegacyProvider): void {
	legacyProviders.set(name, provider);
}

export function getProvider(name: string): LegacyProvider | undefined {
	return legacyProviders.get(name);
}

export function clearProviders(): void {
	legacyProviders.clear();
}
