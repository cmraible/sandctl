import { getRandomName } from "@/session/names";

export function generateID(existingNames: string[]): string {
	return getRandomName(existingNames);
}

export function validateID(id: string): boolean {
	return /^[a-z]{2,15}$/.test(id);
}

export function normalizeName(name: string): string {
	return name.toLowerCase();
}
