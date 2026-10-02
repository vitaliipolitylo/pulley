// Fifty synthetic review requests for the view prototype (Story 1.4): narrow sidebar,
// bottom Panel, themes, zoom, and keyboard checks. Used by `pulley.debugSeed`
// (Development mode only) and by the smoke tests. Pure: `now` is passed in.
import type { CheckSuccess, RequestItem } from '../../../src/core/types.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const repos = [
	'octo/pulley',
	'octo/editor-tools',
	'team/docs',
	'very-long-organization-name/an-equally-long-repository-name-for-truncation',
	'acme/api',
];
const authors = ['alex-chen', 'sam-lee', 'riley-park', 'a-contributor-with-a-long-login', 'dependabot'];
const titles = [
	'Update review queue',
	'Handle GitHub reconnect state',
	'Polish notification copy for requests',
	'Refactor the scheduler so that overlapping checks join the in-flight one instead of starting a second request',
	'Fix typo',
];
// Spread across every age phrase, including unknown request time.
const ages: Array<number | undefined> = [
	30 * 1000,
	5 * MINUTE,
	59 * MINUTE,
	2 * HOUR,
	23 * HOUR,
	30 * HOUR,
	50 * HOUR,
	9 * 24 * HOUR,
	undefined,
	40 * 24 * HOUR,
];

export const FIFTY = 50;

export function fiftyItems(now: number): RequestItem[] {
	return Array.from({ length: FIFTY }, (_, i) => {
		const repo = repos[i % repos.length];
		const number = 1000 + i;
		const age = ages[i % ages.length];
		const item: RequestItem = {
			id: `PULLEY_SEED_${i}`,
			repo,
			number,
			title: `${titles[i % titles.length]} (${i + 1})`,
			author: authors[(i * 3) % authors.length],
			url: `https://github.com/${repo}/pull/${number}`,
		};
		if (age !== undefined) {
			item.requestedAt = now - age;
		}
		return item;
	});
}

/** A complete successful check result carrying the fifty items, for `store.mutate(reconcile, …)`. */
export function fiftyResult(accountId: string, now: number): CheckSuccess {
	return { ok: true, accountId, fetchStartedAt: now, complete: true, items: fiftyItems(now) };
}
