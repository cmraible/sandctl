const MAX_RETRIES = 10;

/**
 * Names drawn from Greek mythology — gods, titans, heroes, nymphs,
 * muses, monsters, and other figures. All lowercase, short and easy to type.
 */
export const names: string[] = [
	// Olympians
	"zeus",
	"hera",
	"athena",
	"apollo",
	"artemis",
	"ares",
	"hermes",
	// Major gods & primordials
	"hades",
	"hestia",
	"eros",
	"gaia",
	"nyx",
	"erebus",
	// Titans
	"kronos",
	"rhea",
	"hyperion",
	"theia",
	"phoebe",
	"themis",
	"atlas",
	"leto",
	"helios",
	"selene",
	"eos",
	"metis",
	"styx",
	"pallas",
	// Heroes & legends
	"perseus",
	"achilles",
	"theseus",
	"jason",
	"orpheus",
	"ajax",
	"hector",
	"paris",
	"helen",
	"priam",
	"aeneas",
	"nestor",
	"orion",
	"cadmus",
	"minos",
	"icarus",
	"medea",
	"peleus",
	"thetis",
	"ariadne",
	"electra",
	"orestes",
	"pandora",
	"penelope",
	// Muses
	"clio",
	"erato",
	"thalia",
	"urania",
	// Nymphs & nature spirits
	"echo",
	"daphne",
	"calypso",
	"circe",
	"galatea",
	"io",
	// Monsters & creatures
	"typhon",
	"medusa",
	"scylla",
	"pegasus",
	"triton",
	"proteus",
	// Winds & sky
	"boreas",
	"notus",
	"iris",
	// Underworld
	"charon",
	"hypnos",
	"morpheus",
	"nemesis",
	"hecate",
	// Other deities & figures
	"pan",
	"nike",
	"tyche",
	"eris",
	"kratos",
	"hebe",
];

if (names.length < 80) {
	throw new Error(
		`mythology name pool has only ${names.length} unique valid names, need 80`,
	);
}

if (new Set(names).size !== names.length) {
	throw new Error("mythology name pool contains duplicates");
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
