import type { CreateOpts, VM } from "@/provider/types";

export interface Provider {
	name(): string;
	create(opts: CreateOpts): Promise<VM>;
	get(id: string): Promise<VM>;
	delete(id: string): Promise<void>;
	reboot(id: string): Promise<void>;
	list(): Promise<VM[]>;
	waitReady(
		id: string,
		timeoutMs: number,
		debug?: (message: string) => void,
	): Promise<void>;
}

export interface SSHKeyManager {
	ensureSSHKey(name: string, publicKey: string): Promise<string>;
}

export interface ResizableProvider {
	resize(
		id: string,
		serverType: string,
		upgradeDisk?: boolean,
		onProgress?: (message: string) => void,
	): Promise<void>;
}

export interface RenamableProvider {
	rename(id: string, name: string): Promise<void>;
}

export interface SnapshotReference {
	id: string;
}

export interface SnapshotCapableProvider {
	findSnapshot(userData: string): Promise<SnapshotReference | null>;
	createSnapshot(
		serverId: string,
		userData: string,
	): Promise<SnapshotReference>;
	cleanupSnapshots(userData: string): Promise<void>;
	postSnapshotSSHSetupCommand(): string;
}

export function supportsResize(
	provider: Provider,
): provider is Provider & ResizableProvider {
	return "resize" in provider && typeof provider.resize === "function";
}

export function supportsRename(
	provider: Provider,
): provider is Provider & RenamableProvider {
	return "rename" in provider && typeof provider.rename === "function";
}

export function supportsSnapshots(
	provider: Provider,
): provider is Provider & SnapshotCapableProvider {
	return (
		"findSnapshot" in provider &&
		typeof provider.findSnapshot === "function" &&
		"createSnapshot" in provider &&
		typeof provider.createSnapshot === "function" &&
		"cleanupSnapshots" in provider &&
		typeof provider.cleanupSnapshots === "function" &&
		"postSnapshotSSHSetupCommand" in provider &&
		typeof provider.postSnapshotSSHSetupCommand === "function"
	);
}
