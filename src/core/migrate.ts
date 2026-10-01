// Reads the raw `pulley.state.v1` value into a typed `Stored` (AD-3 step 3). Pure: never
// mutates its input and never logs; the store logs the returned problem.
import type { Stored } from './types.ts';

export const SCHEMA_VERSION = 1;

export type MigrateResult =
	/** The stored data was written by a newer Pulley: read-only, no writes, no effects. */
	| { readOnly: true; schemaVersion: number }
	/** `malformed` names the problem when the raw value was unusable and `stored` is empty v1. */
	| { readOnly: false; stored: Stored; malformed?: string };

export function emptyStored(): Stored {
	return { schemaVersion: SCHEMA_VERSION, accounts: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the first problem that makes a v1 value unusable, or undefined. */
function v1Problem(raw: Record<string, unknown>): string | undefined {
	if (!isRecord(raw.accounts)) {
		return 'no accounts map';
	}
	for (const account of Object.values(raw.accounts)) {
		if (!isRecord(account) || !isRecord(account.items)) {
			return 'an account has no items map';
		}
		for (const item of Object.values(account.items)) {
			if (!isRecord(item) || typeof item.id !== 'string' || typeof item.firstSeenAt !== 'number') {
				return 'an item entry is not an object with a string id and numeric firstSeenAt';
			}
		}
	}
	return undefined;
}

export function migrate(raw: unknown): MigrateResult {
	if (raw === undefined) {
		return { readOnly: false, stored: emptyStored() };
	}
	if (!isRecord(raw)) {
		return { readOnly: false, stored: emptyStored(), malformed: 'not an object' };
	}
	const version = raw.schemaVersion;
	if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
		return { readOnly: false, stored: emptyStored(), malformed: 'no valid schemaVersion' };
	}
	if (version > SCHEMA_VERSION) {
		return { readOnly: true, schemaVersion: version };
	}
	const problem = v1Problem(raw);
	if (problem) {
		return { readOnly: false, stored: emptyStored(), malformed: problem };
	}
	// v1 is returned as-is (the same object); transitions never mutate it.
	return { readOnly: false, stored: raw as unknown as Stored };
}
