// Notifier tests (Story 2.1): copy, button, dismissal, missing items, at-most-once submission.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backlogLine, copy } from '../../src/core/copy.ts';
import { emptyAccount } from '../../src/core/reconcile.ts';
import type { Effect, Stored, Tracked } from '../../src/core/types.ts';
import { createFocusDelivery, createNotifier } from '../../src/shell/notifier.ts';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const X: Tracked = {
	id: 'X',
	repo: 'octo/app',
	number: 42,
	title: 'Secret title text',
	author: 'alice',
	url: 'https://github.com/octo/app/pull/42',
	firstSeenAt: 1,
	origin: 'new',
	alert: 'shown',
};
const stored = (accounts: Record<string, Tracked[]>): Stored => ({
	schemaVersion: 1,
	accounts: Object.fromEntries(
		Object.entries(accounts).map(([id, items]) => [id, { ...emptyAccount(), items: Object.fromEntries(items.map((t) => [t.id, t])) }]),
	),
});
const notifyNew = (itemId: string, accountId = 'Y'): Effect => ({ kind: 'notifyNew', accountId, itemId });
const TODAY = '2026-10-03';

/** A notifier whose messages resolve only when the test settles them. */
function harness(show?: (text: string, button: string) => PromiseLike<string | undefined>) {
	const shown: Array<{ text: string; button: string; settle: (choice: string | undefined) => void; fail: (error: unknown) => void }> = [];
	const opened: string[] = [];
	const focused: string[] = [];
	const lines: string[] = [];
	const runner = createNotifier({
		showMessage:
			show ??
			((text, button) =>
				new Promise<string | undefined>((resolve, reject) => {
					shown.push({ text, button, settle: resolve, fail: reject });
				})),
		openUrl: (url) => {
			opened.push(url);
			return Promise.resolve(true);
		},
		focusQueue: () => {
			focused.push('queue');
		},
		today: () => TODAY,
		log: (line) => lines.push(line),
	});
	return { runner, shown, opened, focused, lines };
}

test('requester present: the message names the requester', () => {
	const h = harness();
	h.runner([notifyNew('X')], stored({ Y: [{ ...X, requester: 'bob' }] }));
	assert.equal(h.shown.length, 1);
	assert.equal(h.shown[0].text, "Pulley spotted a review request for octo/app#42: 'Secret title text'. Requested by bob.");
	assert.equal(h.shown[0].button, copy.openPullRequestCommandTitle);
	assert.equal(h.shown[0].button, 'Open Pull Request');
});

test('no requester: the message labels the author', () => {
	const h = harness();
	h.runner([notifyNew('X')], stored({ Y: [X] }));
	assert.equal(h.shown[0].text, "Pulley spotted a review request for octo/app#42: 'Secret title text'. Author: alice.");
});

test('the button opens the exact URL', async () => {
	const h = harness();
	h.runner([notifyNew('X')], stored({ Y: [X] }));
	h.shown[0].settle(copy.openPullRequestCommandTitle);
	await tick();
	assert.deepEqual(h.opened, [X.url]);
});

test('dismissal is a no-op: nothing opened, nothing more logged', async () => {
	const h = harness();
	h.runner([notifyNew('X')], stored({ Y: [X] }));
	const before = [...h.lines];
	h.shown[0].settle(undefined);
	await tick();
	assert.deepEqual(h.opened, []);
	assert.deepEqual(h.lines, before);
});

test('showMessage is not awaited: the runner returns while the message is still open', async () => {
	const h = harness();
	const result = h.runner([notifyNew('X')], stored({ Y: [X] }));
	assert.equal(result, undefined, 'the runner is synchronous and does not wait for dismissal');
	await tick();
	assert.equal(h.shown.length, 1, 'still open');
	assert.deepEqual(h.lines, [copy.log.notifiedNew('octo/app#42')]);
});

test('a missing item is logged and skipped', () => {
	const h = harness();
	h.runner([notifyNew('GONE')], stored({ Y: [X] }));
	assert.equal(h.shown.length, 0);
	assert.deepEqual(h.lines, [copy.log.notifyItemMissing('Y', 'GONE')]);
});

test('a missing account is handled like a missing item (X4)', () => {
	const h = harness();
	h.runner([notifyNew('X', 'W')], stored({ Y: [X] }));
	assert.equal(h.shown.length, 0);
	assert.deepEqual(h.lines, [copy.log.notifyItemMissing('W', 'X')]);
});

test('A8: items resolve from effect.accountId, not from any other partition', () => {
	const h = harness();
	const inA = { ...X, title: 'From A', number: 1 };
	const inB = { ...X, title: 'From B', number: 2 };
	h.runner([notifyNew('X', 'A')], stored({ A: [inA], B: [inB] }));
	assert.equal(h.shown.length, 1);
	assert.match(h.shown[0].text, /octo\/app#1: 'From A'/);
});

test('A7: a synchronous throw is caught, logs only notifyFailed with repo#number, and does not escape', () => {
	const h = harness(() => {
		throw new Error('host gone');
	});
	assert.doesNotThrow(() => h.runner([notifyNew('X'), notifyNew('X')], stored({ Y: [X] })));
	assert.deepEqual(h.lines, [copy.log.notifyFailed('octo/app#42'), copy.log.notifyFailed('octo/app#42')]);
});

test('A7: an async rejection is caught; notifiedNew then notifyFailed, with no title in any log', async () => {
	const h = harness();
	const unhandled: unknown[] = [];
	const onUnhandled = (reason: unknown) => unhandled.push(reason);
	process.on('unhandledRejection', onUnhandled);
	try {
		h.runner([notifyNew('X')], stored({ Y: [X] }));
		h.shown[0].fail(new Error('Secret title text in an error'));
		await tick();
		await tick();
	} finally {
		process.off('unhandledRejection', onUnhandled);
	}
	assert.deepEqual(unhandled, []);
	assert.deepEqual(h.lines, [copy.log.notifiedNew('octo/app#42'), copy.log.notifyFailed('octo/app#42')]);
	assert.ok(h.lines.every((line) => !line.includes('Secret title')));
});

test('one notification per effect, in effect order', () => {
	const h = harness();
	const A = { ...X, id: 'A', number: 1 };
	const B = { ...X, id: 'B', number: 2 };
	h.runner([notifyNew('A'), notifyNew('B')], stored({ Y: [A, B] }));
	assert.deepEqual(
		h.shown.map((s) => s.text.match(/#(\d+)/)?.[1]),
		['1', '2'],
	);
	assert.deepEqual(h.lines, [copy.log.notifiedNew('octo/app#1'), copy.log.notifiedNew('octo/app#2')]);
});

test('notification log lines never carry the title', () => {
	const h = harness();
	h.runner([notifyNew('X')], stored({ Y: [{ ...X, requester: 'bob' }] }));
	assert.ok(h.lines.every((line) => !line.includes('Secret title') && !line.includes('bob')));
});

// Focus delivery: the shell runs windowFocused after focus events and account-changing lookups.

function focusHarness(focusedNow: boolean) {
	const calls: Array<{ activeAccountId: string | undefined; today: string }> = [];
	const lines: string[] = [];
	const delivery = createFocusDelivery({
		store: {
			mutate: async (_transition: unknown, _input: unknown, ctx: unknown) => {
				calls.push(ctx as { activeAccountId: string | undefined; today: string });
			},
		} as never,
		isFocused: () => focusedNow,
		today: () => TODAY,
		log: (line) => lines.push(line),
	});
	return { delivery, calls, lines };
}

test('focus delivery: a lookup that changes the active account in a focused window runs windowFocused for it', async () => {
	const h = focusHarness(true);
	await h.delivery.lookupApplied(undefined, 'Y');
	assert.deepEqual(h.calls, [{ activeAccountId: 'Y', today: TODAY }]);
});

test('focus delivery: an unchanged account, a signed-out lookup, or an unfocused window does nothing', async () => {
	const focusedH = focusHarness(true);
	await focusedH.delivery.lookupApplied('Y', 'Y');
	await focusedH.delivery.lookupApplied('Y', undefined);
	assert.deepEqual(focusedH.calls, []);
	const unfocused = focusHarness(false);
	await unfocused.delivery.lookupApplied(undefined, 'Y');
	assert.deepEqual(unfocused.calls, []);
});

test('focus delivery: a failing mutate is logged and never rejects', async () => {
	const lines: string[] = [];
	const delivery = createFocusDelivery({
		store: { mutate: () => Promise.reject(new Error('disk full')) },
		isFocused: () => true,
		today: () => TODAY,
		log: (line) => lines.push(line),
	});
	await delivery.focused('Y');
	assert.deepEqual(lines, [copy.log.focusDeliveryFailed('disk full')]);
});

// Story 2.2: the aggregate backlog notification.

const notifyBacklog = (count: number, firstConnection = false, accountId = 'Y'): Effect => ({ kind: 'notifyBacklog', accountId, count, firstConnection });

test('backlog: the message is the count plus the day line; the one button is Open Review Queue', () => {
	const h = harness();
	h.runner([notifyBacklog(3, true)], stored({ Y: [X] }));
	assert.equal(h.shown.length, 1);
	assert.equal(h.shown[0].text, copy.backlogNotification(3, TODAY));
	assert.equal(h.shown[0].text, `3 reviews are waiting. ${backlogLine(TODAY)}`);
	assert.equal(h.shown[0].button, 'Open Review Queue');
	assert.deepEqual(h.lines, [copy.log.notifiedBacklog(3)]);
});

test('backlog: the button runs focusQueue (pulley.queue.focus) and opens no URL', async () => {
	const h = harness();
	h.runner([notifyBacklog(2)], stored({ Y: [X] }));
	h.shown[0].settle(copy.openReviewQueue);
	await tick();
	assert.deepEqual(h.focused, ['queue']);
	assert.deepEqual(h.opened, []);
});

test('backlog: dismissal is a no-op', async () => {
	const h = harness();
	h.runner([notifyBacklog(2)], stored({ Y: [X] }));
	const before = [...h.lines];
	h.shown[0].settle(undefined);
	await tick();
	assert.deepEqual(h.focused, []);
	assert.deepEqual(h.lines, before);
});

test('backlog: showMessage is not awaited inside the runner', () => {
	const h = harness();
	assert.equal(h.runner([notifyBacklog(2)], stored({ Y: [X] })), undefined);
	assert.equal(h.shown.length, 1);
});

test('backlog (A7): a synchronous throw logs notifyFailed with the count only and does not escape', () => {
	const h = harness(() => {
		throw new Error('host gone');
	});
	assert.doesNotThrow(() => h.runner([notifyBacklog(4)], stored({ Y: [X] })));
	assert.deepEqual(h.lines, [copy.log.notifyFailed(copy.log.backlogSubject(4))]);
});

test('backlog (A7): an async rejection logs notifiedBacklog then notifyFailed with the count only', async () => {
	const h = harness();
	const unhandled: unknown[] = [];
	const onUnhandled = (reason: unknown) => unhandled.push(reason);
	process.on('unhandledRejection', onUnhandled);
	try {
		h.runner([notifyBacklog(4)], stored({ Y: [{ ...X, title: 'Secret title text' }] }));
		h.shown[0].fail(new Error('Secret title text in an error'));
		await tick();
		await tick();
	} finally {
		process.off('unhandledRejection', onUnhandled);
	}
	assert.deepEqual(unhandled, []);
	assert.deepEqual(h.lines, [copy.log.notifiedBacklog(4), copy.log.notifyFailed(copy.log.backlogSubject(4))]);
	assert.ok(h.lines.every((line) => !line.includes('Secret title') && !line.includes('octo/app')));
});

test('backlog: a failing focusQueue is logged and never escapes', async () => {
	const lines: string[] = [];
	let settle!: (choice: string | undefined) => void;
	const runner = createNotifier({
		showMessage: () => new Promise<string | undefined>((resolve) => (settle = resolve)),
		openUrl: () => undefined,
		focusQueue: () => Promise.reject(new Error('no view')),
		today: () => TODAY,
		log: (line) => lines.push(line),
	});
	runner([notifyBacklog(1)], stored({ Y: [X] }));
	settle(copy.openReviewQueue);
	await tick();
	await tick();
	assert.deepEqual(lines, [copy.log.notifiedBacklog(1), copy.log.focusQueueFailed('no view')]);
});

test('backlog and new effects in one run: one notification each, in effect order', () => {
	const h = harness();
	h.runner([notifyBacklog(2), notifyNew('X')], stored({ Y: [X] }));
	assert.equal(h.shown.length, 2);
	assert.equal(h.shown[0].button, copy.openReviewQueue);
	assert.equal(h.shown[1].button, copy.openPullRequestCommandTitle);
});
