// Backlog notification copy (Story 2.2): deterministic rotation and gentle wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backlogLine, copy } from '../../src/core/copy.ts';

/** Every local day of 2026 as `YYYY-MM-DD`, built without Date so no time zone is involved. */
function daysOf2026(): string[] {
	const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	const days: string[] = [];
	lengths.forEach((n, m) => {
		for (let d = 1; d <= n; d++) {
			days.push(`2026-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
		}
	});
	return days;
}

test('backlogLines are the four drafted lines', () => {
	assert.deepEqual(copy.backlogLines, [
		'The corgi is keeping them warm for you.',
		"No rush. They'll be here when you're ready.",
		'One at a time is plenty.',
		'The corgi saved your place in line.',
	]);
});

test('matrix "Rotation": the same day always gives the same line', () => {
	for (const day of ['2026-10-03', '2026-01-01', '1999-12-31']) {
		assert.equal(backlogLine(day), backlogLine(day));
		assert.ok((copy.backlogLines as readonly string[]).includes(backlogLine(day)));
	}
});

test('matrix "Rotation": across a year of dates every line is picked', () => {
	const picked = new Set(daysOf2026().map(backlogLine));
	assert.deepEqual([...picked].sort(), [...copy.backlogLines].sort());
});

test('backlogNotification is the pending count, a space, and the day line', () => {
	assert.equal(copy.backlogNotification(3, '2026-10-03'), `3 reviews are waiting. ${backlogLine('2026-10-03')}`);
	assert.equal(copy.backlogNotification(1, '2026-10-03'), `1 review is waiting. ${backlogLine('2026-10-03')}`);
});

test('no backlog line or notification shames, scores, or escalates', () => {
	const forbidden = ['behind', 'overdue', 'late', 'score', '!'];
	const texts = [...copy.backlogLines, copy.backlogNotification(5, '2026-10-03'), copy.openReviewQueue];
	for (const text of texts) {
		for (const word of forbidden) {
			assert.ok(!text.toLowerCase().includes(word), `"${text}" contains "${word}"`);
		}
	}
});

test('the backlog button is "Open Review Queue"', () => {
	assert.equal(copy.openReviewQueue, 'Open Review Queue');
});
