import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMessage, rowDescription, rowTooltip } from '../../src/core/checkPresentation.ts';
import { copy } from '../../src/core/copy.ts';
import type { CheckResult, FailureReason, RequestItem } from '../../src/core/types.ts';

const item = (n: number): RequestItem => ({
	id: `PR_${n}`,
	repo: 'octo/app',
	number: n,
	title: `Fix ${n}`,
	author: 'alice',
	url: `https://github.com/octo/app/pull/${n}`,
});
const ok = (complete: boolean, items: RequestItem[]): CheckResult => ({ ok: true, accountId: 'a', fetchStartedAt: 1, complete, items });

test('row description is owner/name#number · author', () => {
	assert.equal(rowDescription(item(42)), 'octo/app#42 · alice');
	assert.equal(rowTooltip(item(42)), 'Fix 42\nocto/app#42 · alice');
});

test('clear only for complete success with zero items, verbatim UX copy', () => {
	assert.equal(checkMessage(ok(true, [])), 'No reviews are waiting in repositories visible to this GitHub sign-in.');
});

test('pending', () => {
	assert.equal(checkMessage(ok(true, [item(1), item(2), item(3)])), '3 reviews are waiting.');
	assert.equal(checkMessage(ok(true, [item(1)])), '1 review is waiting.');
});

test('incomplete never shows clear or a zero', () => {
	const empty = checkMessage(ok(false, []));
	assert.equal(empty, copy.incomplete);
	assert.doesNotMatch(empty, /\b0\b|no reviews/i);
	assert.match(checkMessage(ok(false, [item(1), item(2)])), /^2 reviews are waiting\. .*may be incomplete/);
});

test('every failure reason says "Couldn\'t check GitHub." with no zero', () => {
	const reasons: FailureReason[] = ['signed_out', 'unauthenticated', 'network', 'rate_limited', 'graphql_error'];
	for (const reason of reasons) {
		const text = checkMessage({ ok: false, fetchStartedAt: 1, reason });
		assert.equal(text, "Couldn't check GitHub.");
		assert.doesNotMatch(text, /\b0\b|no reviews/i);
	}
});

test('checking copy shows no zero', () => {
	assert.equal(copy.checking, 'Checking review requests…');
});
