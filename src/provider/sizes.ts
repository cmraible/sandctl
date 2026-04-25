/**
 * Named VM sizes that map to provider-specific server types.
 * Provides a user-friendly abstraction over raw server type identifiers.
 */

export interface VMSize {
	name: string;
	serverType: string;
	cores: number;
	memoryGB: number;
	description: string;
}

const sizeMaps = {
	digitalocean: new Map<string, VMSize>([
		[
			"small",
			{
				name: "small",
				serverType: "s-2vcpu-4gb",
				cores: 2,
				memoryGB: 4,
				description: "2 vCPU / 4 GB RAM",
			},
		],
		[
			"medium",
			{
				name: "medium",
				serverType: "s-4vcpu-8gb",
				cores: 4,
				memoryGB: 8,
				description: "4 vCPU / 8 GB RAM",
			},
		],
		[
			"large",
			{
				name: "large",
				serverType: "s-8vcpu-16gb",
				cores: 8,
				memoryGB: 16,
				description: "8 vCPU / 16 GB RAM",
			},
		],
		[
			"xlarge",
			{
				name: "xlarge",
				serverType: "s-16vcpu-32gb",
				cores: 16,
				memoryGB: 32,
				description: "16 vCPU / 32 GB RAM",
			},
		],
	]),
	gcp: new Map<string, VMSize>([
		[
			"small",
			{
				name: "small",
				serverType: "e2-standard-2",
				cores: 2,
				memoryGB: 8,
				description: "2 vCPU / 8 GB RAM",
			},
		],
		[
			"medium",
			{
				name: "medium",
				serverType: "e2-standard-4",
				cores: 4,
				memoryGB: 16,
				description: "4 vCPU / 16 GB RAM",
			},
		],
		[
			"large",
			{
				name: "large",
				serverType: "e2-standard-8",
				cores: 8,
				memoryGB: 32,
				description: "8 vCPU / 32 GB RAM",
			},
		],
		[
			"xlarge",
			{
				name: "xlarge",
				serverType: "e2-standard-16",
				cores: 16,
				memoryGB: 64,
				description: "16 vCPU / 64 GB RAM",
			},
		],
	]),
	hetzner: new Map<string, VMSize>([
		[
			"small",
			{
				name: "small",
				serverType: "cpx21",
				cores: 3,
				memoryGB: 4,
				description: "3 vCPU / 4 GB RAM",
			},
		],
		[
			"medium",
			{
				name: "medium",
				serverType: "cpx31",
				cores: 4,
				memoryGB: 8,
				description: "4 vCPU / 8 GB RAM",
			},
		],
		[
			"large",
			{
				name: "large",
				serverType: "cpx41",
				cores: 8,
				memoryGB: 16,
				description: "8 vCPU / 16 GB RAM",
			},
		],
		[
			"xlarge",
			{
				name: "xlarge",
				serverType: "cpx51",
				cores: 16,
				memoryGB: 32,
				description: "16 vCPU / 32 GB RAM",
			},
		],
	]),
} as const;

const DEFAULT_PROVIDER = "hetzner";

export function resolveSize(
	name: string,
	providerName = DEFAULT_PROVIDER,
): VMSize | undefined {
	const sizes =
		sizeMaps[providerName as keyof typeof sizeMaps] ?? sizeMaps.hetzner;
	return sizes.get(name.toLowerCase());
}

export function availableSizes(
	providerName = DEFAULT_PROVIDER,
): readonly VMSize[] {
	const sizes =
		sizeMaps[providerName as keyof typeof sizeMaps] ?? sizeMaps.hetzner;
	return [...sizes.values()];
}

export function sizesHelpText(providerName = DEFAULT_PROVIDER): string {
	return availableSizes(providerName)
		.map((size) => `  ${size.name}\t${size.description}`)
		.join("\n");
}
