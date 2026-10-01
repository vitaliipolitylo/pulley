import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWithRetry } from '../../src/shell/checkWithRetry.ts';
import type { CheckResult } from '../../src/core/types.ts';

const unauth: CheckResult = { ok: false, accountId: 'a', fetchStartedAt: 1, reason: 'unauthenticated' };
const success: CheckResult = { ok: true, accountId: 'a', fetchStartedAt: 2, complete: true, items: [] };

function harness(results: CheckResult[], session: { accountId: string; token: string } | null = { accountId: "a", token: "t" }) {
	let tokenLookups = 0;
	let checks = 0;
	const run = () =>
		checkWithRetry({
			getToken: async () => {
				tokenLookups++;
				return session ?? undefined;
			},
			runCheck: async () => {
				const r = results[checks++];
				if (!r) {
					throw new Error('unexpected extra check');
				}
				return r;
			},
			log: () => {},
		});
	return { run, counts: () => ({ tokenLookups, checks }) };
}

test('first unauthenticated triggers exactly one more token lookup and check', async () => {
	const h = harness([unauth, success]);
	assert.deepEqual(await h.run(), success);
	assert.deepEqual(h.counts(), { tokenLookups: 2, checks: 2 });
});

test('a second unauthenticated is returned, not retried again', async () => {
	const h = harness([unauth, unauth, success]);
	assert.deepEqual(await h.run(), unauth);
	assert.deepEqual(h.counts(), { tokenLookups: 2, checks: 2 });
});

test('a success is not retried', async () => {
	const h = harness([success]);
	assert.deepEqual(await h.run(), success);
	assert.deepEqual(h.counts(), { tokenLookups: 1, checks: 1 });
});

test('no session returns undefined without a check', async () => {
	const h = harness([], null);
	assert.equal(await h.run(), undefined);
	assert.deepEqual(h.counts(), { tokenLookups: 1, checks: 0 });
});
