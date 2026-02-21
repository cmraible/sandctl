import { faker } from "@faker-js/faker";

const NAME_PATTERN = /^[a-z]{2,15}$/;
const MAX_NAMES = 250;
const MAX_RETRIES = 10;

function normalizeName(raw: string): string {
	return raw.toLowerCase().replace(/[^a-z]/g, "");
}

faker.seed(20260221);

const firstNameDefinitions = faker.definitions.person.first_name as {
	generic: string[];
	female: string[];
	male: string[];
};

const generatedPool = faker.helpers
	.shuffle([
		...firstNameDefinitions.generic,
		...firstNameDefinitions.female,
		...firstNameDefinitions.male,
	])
	.map((name) => normalizeName(name))
	.filter((name): name is string => NAME_PATTERN.test(name));

export const names: string[] = Array.from(new Set(generatedPool)).slice(
	0,
	MAX_NAMES,
);

if (names.length < MAX_NAMES) {
	throw new Error("faker name pool did not generate enough unique valid names");
}

export function getRandomName(existingNames: string[]): string {
	const used = new Set(existingNames.map((name) => name.toLowerCase()));

	if (used.size >= names.length) {
		throw new Error(
			"no available names. Please destroy unused sandboxes with 'sandctl destroy <name>'",
		);
	}

	for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
		const candidate = names[Math.floor(Math.random() * names.length)];
		if (!used.has(candidate)) {
			return candidate;
		}
	}

	for (const candidate of names) {
		if (!used.has(candidate)) {
			return candidate;
		}
	}

	throw new Error(
		"no available names. Please destroy unused sandboxes with 'sandctl destroy <name>'",
	);
}
