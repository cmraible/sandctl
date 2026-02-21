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

export class VMNotFoundError extends Error {
	constructor(providerId: string) {
		super(`VM with provider ID '${providerId}' not found`);
		this.name = "VMNotFoundError";
	}
}

export interface Provider {
	// Throws VMNotFoundError when providerId is not found.
	getVM(providerId: string): Promise<VM>;
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
