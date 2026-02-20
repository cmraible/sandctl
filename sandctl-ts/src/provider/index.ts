export type VMStatus =
	| "running"
	| "provisioning"
	| "starting"
	| "stopped"
	| "stopping"
	| "deleting"
	| "failed";

export interface VM {
	id: string;
	status: VMStatus;
	ip_address?: string;
}

export interface Provider {
	// Returns null when providerId is not found; throws for provider/API errors.
	getVM(providerId: string): Promise<VM | null>;
	// Throws when the provider delete operation fails.
	deleteVM(providerId: string): Promise<void>;
}

const providers = new Map<string, Provider>();

export function registerProvider(name: string, provider: Provider): void {
	providers.set(name, provider);
}

export function getProvider(name: string): Provider | undefined {
	return providers.get(name);
}

export function clearProviders(): void {
	providers.clear();
}
