import { getRandomName } from "@/session/names";

export function generateID(existingNames: string[]): string {
	return getRandomName(existingNames);
}

export function validateID(id: string): boolean {
	return /^[a-z][a-z0-9-]{0,28}[a-z0-9]$/.test(id);
}

export function normalizeName(name: string): string {
	return name.trim().toLowerCase();
}
