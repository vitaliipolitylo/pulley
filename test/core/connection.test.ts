import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { copy, unauthenticatedWelcome, unconnectedWelcome } from '../../src/core/copy.ts';
import { shortReason } from '../../src/core/connection.ts';

// npm scripts run from the project root.
const root = process.cwd();
const VISIBILITY_NOTE = 'Only repositories visible to this GitHub sign-in are included.';

test('unconnected copy carries the visibility note', () => {
	assert.ok(copy.unconnectedExplanation.includes(VISIBILITY_NOTE));
	assert.ok(unconnectedWelcome.includes(VISIBILITY_NOTE));
	assert.ok(unconnectedWelcome.includes('[Connect](command:pulley.connect)'));
	assert.ok(copy.unauthenticatedExplanation.includes(VISIBILITY_NOTE));
	assert.ok(unauthenticatedWelcome.includes('[Reconnect](command:pulley.connect)'));
});

test('connection and loading copy show no zero or "no reviews"', () => {
	for (const text of [copy.checkingConnection, copy.unconnectedExplanation, copy.unauthenticatedExplanation, copy.unavailable, copy.checking]) {
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
	assert.deepEqual(pkg.contributes.viewsWelcome, [
		{ view: 'pulley.queue', contents: unconnectedWelcome, when: 'pulley.connection == unconnected' },
		{ view: 'pulley.queue', contents: unauthenticatedWelcome, when: 'pulley.connection == unauthenticated' },
	]);
	assert.equal(pkg.contributes.views.pulley[0].name, copy.queueViewName);
	assert.equal(pkg.contributes.viewsContainers.activitybar[0].title, copy.viewContainerTitle);
	assert.equal(
		pkg.contributes.commands.find((c: { command: string }) => c.command === 'pulley.connect').title,
		copy.connectCommandTitle,
	);
	const title = (id: string) => pkg.contributes.commands.find((c: { command: string }) => c.command === id).title;
	assert.equal(title('pulley.openPullRequest'), copy.openPullRequestCommandTitle);
	assert.equal(title('pulley.debugSeed'), copy.debugSeedCommandTitle);
	assert.equal(title('pulley.refresh'), copy.refreshCommandTitle);
	assert.equal(title('pulley.reconnect'), copy.reconnectCommandTitle);
	const reconnect = pkg.contributes.commands.find((c: { command: string }) => c.command === 'pulley.reconnect');
	assert.equal(reconnect.icon, '$(account)');
	const refresh = pkg.contributes.commands.find((c: { command: string }) => c.command === 'pulley.refresh');
	assert.equal(refresh.icon, '$(refresh)');
	assert.deepEqual(pkg.contributes.menus['view/title'], [
		{ command: 'pulley.refresh', when: 'view == pulley.queue && pulley.connection == connected', group: 'navigation' },
		{ command: 'pulley.reconnect', when: 'view == pulley.queue && pulley.connection == unauthenticated', group: 'navigation' },
	]);
	const interval = pkg.contributes.configuration.properties['pulley.checkIntervalMinutes'];
	assert.deepEqual(
		{ ...interval, markdownDescription: undefined },
		{ type: 'number', default: 15, minimum: 5, maximum: 240, scope: 'application', markdownDescription: undefined },
	);
	assert.equal(interval.markdownDescription, copy.checkIntervalDescription);
	const threshold = pkg.contributes.configuration.properties['pulley.backlogThreshold'];
	assert.deepEqual(
		{ ...threshold, markdownDescription: undefined },
		{ type: 'number', default: 5, minimum: 1, scope: 'application', markdownDescription: undefined },
	);
	assert.equal(threshold.markdownDescription, copy.backlogThresholdDescription);
	assert.deepEqual(Object.keys(pkg.contributes.configuration.properties), ['pulley.checkIntervalMinutes', 'pulley.backlogThreshold']);
	assert.equal(pkg.contributes.keybindings, undefined, 'no custom keyboard shortcut');
	assert.deepEqual(pkg.contributes.menus.commandPalette, [
		{ command: 'pulley.openPullRequest', when: 'false' },
		{ command: 'pulley.reconnect', when: 'pulley.connection == unauthenticated' },
		{ command: 'pulley.debugSeed', when: 'pulley.development' },
	]);
	assert.deepEqual(pkg.activationEvents, ['onStartupFinished']);
});

test('package.json fixes the extension identity', () => {
	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	// globalState is keyed by the extension ID, so publisher and name never change.
	assert.equal(pkg.publisher, 'vitaliipolitylo');
	assert.equal(pkg.name, 'pulley');
	assert.match(pkg.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
	assert.equal(pkg.license, 'MIT');
});

test('src/core has no vscode import', () => {
	const files = readdirSync(join(root, 'src', 'core')).filter((f) => f.endsWith('.ts'));
	assert.ok(files.length > 0);
	for (const file of files) {
		const source = readFileSync(join(root, 'src', 'core', file), 'utf8');
		assert.doesNotMatch(source, /from\s+['"]vscode['"]|require\(\s*['"]vscode['"]\s*\)/);
	}
});

test('src/core has no timers, Math.random, or clock reads', () => {
	for (const file of readdirSync(join(root, 'src', 'core')).filter((f) => f.endsWith('.ts'))) {
		const source = readFileSync(join(root, 'src', 'core', file), 'utf8');
		assert.doesNotMatch(source, /\bset(Timeout|Interval|Immediate)\s*\(|Math\.random|Date\.now|new Date\(|performance\.now/, file);
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
