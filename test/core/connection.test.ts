import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { copy, unconnectedWelcome } from '../../src/core/copy.ts';
import {
	connectionMessage,
	connectionPresentation,
	shortReason,
	type ConnectionState,
} from '../../src/core/connection.ts';

// npm scripts run from the project root.
const root = process.cwd();
const VISIBILITY_NOTE = 'Only repositories visible to this GitHub sign-in are included.';

const cases: Array<{ name: string; state: ConnectionState; message: string; hasMessage: boolean }> = [
	{ name: 'unknown', state: { kind: 'unknown' }, message: 'Checking GitHub connection…', hasMessage: true },
	{ name: 'unconnected', state: { kind: 'unconnected' }, message: copy.unconnectedExplanation, hasMessage: false },
	{
		name: 'connected',
		state: { kind: 'connected', accountId: '123', label: 'octocat' },
		message: 'Connected as octocat. Waiting for the first check.',
		hasMessage: true,
	},
];

for (const c of cases) {
	test(`connectionMessage: ${c.name}`, () => {
		assert.equal(connectionMessage(c.state), c.message);
	});

	test(`connectionPresentation: ${c.name}`, () => {
		const p = connectionPresentation(c.state);
		assert.equal(p.contextKey, c.state.kind);
		assert.equal(p.message, c.hasMessage ? c.message : undefined);
	});

	test(`no zero count or "no reviews" state: ${c.name}`, () => {
		const text = connectionMessage(c.state);
		assert.doesNotMatch(text, /\b0\b|\bzero\b|no reviews/i);
	});
}

test('unconnected copy carries the visibility note', () => {
	assert.ok(connectionMessage({ kind: 'unconnected' }).includes(VISIBILITY_NOTE));
	assert.ok(unconnectedWelcome.includes(VISIBILITY_NOTE));
	assert.ok(unconnectedWelcome.includes('(command:pulley.connect)'));
});

test('input state is not mutated', () => {
	const state: ConnectionState = { kind: 'connected', accountId: '1', label: 'a' };
	const before = JSON.stringify(state);
	connectionPresentation(state);
	assert.equal(JSON.stringify(state), before);
});

test('shortReason is single-line and bounded', () => {
	assert.equal(shortReason(new Error('Cancelled')), 'Cancelled');
	assert.equal(shortReason('a\n  b'), 'a b');
	assert.equal(shortReason(undefined), 'unknown error');
	assert.ok(shortReason(new Error('x'.repeat(500))).length <= 120);
});

test('package.json strings mirror copy.ts', () => {
	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	const welcome = pkg.contributes.viewsWelcome.find((w: { view: string }) => w.view === 'pulley.queue');
	assert.equal(welcome.contents, unconnectedWelcome);
	assert.equal(welcome.when, 'pulley.connection == unconnected');
	assert.equal(pkg.contributes.views.pulley[0].name, copy.queueViewName);
	assert.equal(pkg.contributes.viewsContainers.activitybar[0].title, copy.viewContainerTitle);
	assert.equal(
		pkg.contributes.commands.find((c: { command: string }) => c.command === 'pulley.connect').title,
		copy.connectCommandTitle,
	);
	assert.deepEqual(pkg.activationEvents, ['onStartupFinished']);
});

test('src/core has no vscode import', () => {
	const files = readdirSync(join(root, 'src', 'core')).filter((f) => f.endsWith('.ts'));
	assert.ok(files.length > 0);
	for (const file of files) {
		const source = readFileSync(join(root, 'src', 'core', file), 'utf8');
		assert.doesNotMatch(source, /from\s+['"]vscode['"]|require\(\s*['"]vscode['"]\s*\)/);
	}
});
