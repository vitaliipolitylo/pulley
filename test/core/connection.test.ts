import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { copy, unconnectedWelcome } from '../../src/core/copy.ts';
import { shortReason } from '../../src/core/connection.ts';

// npm scripts run from the project root.
const root = process.cwd();
const VISIBILITY_NOTE = 'Only repositories visible to this GitHub sign-in are included.';

test('unconnected copy carries the visibility note', () => {
	assert.ok(copy.unconnectedExplanation.includes(VISIBILITY_NOTE));
	assert.ok(unconnectedWelcome.includes(VISIBILITY_NOTE));
	assert.ok(unconnectedWelcome.includes('(command:pulley.connect)'));
});

test('connection and loading copy show no zero or "no reviews"', () => {
	for (const text of [copy.checkingConnection, copy.unconnectedExplanation, copy.checking]) {
		assert.doesNotMatch(text, /\b0\b|\bzero\b|no reviews/i);
	}
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
	const title = (id: string) => pkg.contributes.commands.find((c: { command: string }) => c.command === id).title;
	assert.equal(title('pulley.openPullRequest'), copy.openPullRequestCommandTitle);
	assert.equal(title('pulley.debugSeed'), copy.debugSeedCommandTitle);
	assert.deepEqual(pkg.contributes.menus.commandPalette, [
		{ command: 'pulley.openPullRequest', when: 'false' },
		{ command: 'pulley.debugSeed', when: 'pulley.development' },
	]);
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

test('globalState.update is called only from src/shell/store.ts', () => {
	const walk = (dir: string): string[] =>
		readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
			e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
		);
	for (const file of walk(join(root, 'src'))) {
		const source = readFileSync(file, 'utf8');
		const writes = /\.update\(\s*STATE_KEY|globalState\.update|workspaceState/.test(source);
		assert.equal(writes, file.endsWith(join('shell', 'store.ts')), file);
	}
});
