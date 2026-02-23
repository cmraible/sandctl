import type { CreateOpts, VM } from "@/provider/types";

export interface Provider {
	name(): string;
	create(opts: CreateOpts): Promise<VM>;
	get(id: string): Promise<VM>;
	delete(id: string): Promise<void>;
	list(): Promise<VM[]>;
	waitReady(id: string, timeoutMs: number): Promise<void>;
}

export interface SSHKeyManager {
	ensureSSHKey(name: string, publicKey: string): Promise<string>;
}
