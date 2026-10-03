// Reads the raw `pulley.state.v1` value into a typed `Stored` (AD-3 step 3). Pure: never
// mutates its input and never logs; the store logs the returned problem.
import type { AlertState, FailureReason, Origin, Stored } from './types.ts';

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

/** Date's usable range: a larger magnitude is an invalid Date, and formatting it throws. */
const MAX_EPOCH_MS = 8.64e15;

const FAILURE_REASONS: ReadonlySet<unknown> = new Set<FailureReason>([
	'signed_out',
	'unauthenticated',
	'network',
	'rate_limited',
	'graphql_error',
]);

const ORIGINS: ReadonlySet<unknown> = new Set<Origin>(['new', 'backlog']);

const ALERT_STATES: ReadonlySet<unknown> = new Set<AlertState>(['none', 'pending', 'shown']);

const ACCOUNT_TIMESTAMPS = ['lastAttemptAt', 'lastSuccessAt', 'lastAppliedFetchStartedAt', 'lastIncompleteFetchStartedAt'] as const;

/** A local calendar day as `YYYY-MM-DD`. */
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `'none'`, or `{ state: 'pending' | 'shown', firstConnection: boolean }` (AD-8). */
function isBacklogAlert(value: unknown): boolean {
	if (value === 'none') {
		return true;
	}
	return (
		isRecord(value) &&
		(value.state === 'pending' || value.state === 'shown') &&
		typeof value.firstConnection === 'boolean'
	);
}

/** A finite epoch-ms number that Date can represent. */
function isTimestamp(value: unknown): boolean {
	return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_EPOCH_MS;
}

/** Returns the first problem in an account's timestamps or lastFailure, or undefined. */
function accountFieldProblem(account: Record<string, unknown>): string | undefined {
	for (const field of ACCOUNT_TIMESTAMPS) {
		if (account[field] !== undefined && !isTimestamp(account[field])) {
			return `an account has an invalid ${field}`;
		}
	}
	const interval = account.lastAttemptIntervalMs;
	if (interval !== undefined && !(typeof interval === 'number' && Number.isFinite(interval) && interval > 0)) {
		return 'an account has an invalid lastAttemptIntervalMs';
	}
	const date = account.lastBacklogReminderDate;
	if (date !== undefined && !(typeof date === 'string' && LOCAL_DATE.test(date))) {
		return 'an account has an invalid lastBacklogReminderDate';
	}
	if (!isBacklogAlert(account.backlogAlert)) {
		return 'an account has an invalid backlogAlert';
	}
	const failure = account.lastFailure;
	if (failure !== undefined) {
		if (!isRecord(failure) || !isTimestamp(failure.at) || !FAILURE_REASONS.has(failure.reason)) {
			return 'an account has an invalid lastFailure';
		}
	}
	return undefined;
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
		const fieldProblem = accountFieldProblem(account);
		if (fieldProblem) {
			return fieldProblem;
		}
		if (typeof account.newSignal !== 'boolean') {
			return 'an account has an invalid newSignal';
		}
		for (const item of Object.values(account.items)) {
			if (!isRecord(item) || typeof item.id !== 'string' || typeof item.firstSeenAt !== 'number') {
				return 'an item entry is not an object with a string id and numeric firstSeenAt';
			}
			if (!ORIGINS.has(item.origin)) {
				return 'an item has an invalid origin';
			}
			if (!ALERT_STATES.has(item.alert)) {
				return 'an item has an invalid alert';
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
