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

const sizes: VMSize[] = [
	{
		name: "small",
		serverType: "cpx21",
		cores: 3,
		memoryGB: 4,
		description: "3 vCPU / 4 GB RAM",
	},
	{
		name: "medium",
		serverType: "cpx31",
		cores: 4,
		memoryGB: 8,
		description: "4 vCPU / 8 GB RAM",
	},
	{
		name: "large",
		serverType: "cpx41",
		cores: 8,
		memoryGB: 16,
		description: "8 vCPU / 16 GB RAM",
	},
	{
		name: "xlarge",
		serverType: "cpx51",
		cores: 16,
		memoryGB: 32,
		description: "16 vCPU / 32 GB RAM",
	},
];

const sizeMap = new Map<string, VMSize>(sizes.map((s) => [s.name, s]));

/**
 * Resolve a size name to its corresponding server type.
 * Returns undefined if the size name is not recognized.
 */
export function resolveSize(name: string): VMSize | undefined {
	return sizeMap.get(name.toLowerCase());
}

/**
 * Return all available size names.
 */
export function availableSizes(): readonly VMSize[] {
	return sizes;
}

/**
 * Format a help string listing all available sizes.
 */
export function sizesHelpText(): string {
	return sizes.map((s) => `  ${s.name}\t${s.description}`).join("\n");
}
