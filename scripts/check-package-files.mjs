// Fails when the packaged extension would ship anything outside the allowlist,
// or when the bundle contains something that looks like a GitHub token.
// Run after `npm run vsix` so dist/extension.js is the production bundle.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vsce = join(root, 'node_modules', '@vscode', 'vsce', 'vsce');

const ALLOWED = [
	/^package\.json$/,
	/^README\.md$/,
	/^CHANGELOG\.md$/,
	/^LICENSE[^/]*$/,
	/^dist\/extension\.js$/,
	/^media\/.+$/,
];

const TOKEN_PATTERNS = [
	{ name: 'ghp_/gho_/ghs_/ghu_/ghr_', pattern: /gh[opsur]_/ },
	{ name: 'github_pat_', pattern: /github_pat_/ },
	// "Bearer " followed by a literal token, not a template placeholder.
	{ name: 'Bearer <literal token>', pattern: /bearer\s+[A-Za-z0-9_\-.~+/]{8,}=*/i },
];

const failures = [];

const listing = execFileSync(process.execPath, [vsce, 'ls'], { cwd: root, encoding: 'utf8' });
const files = listing
	.split(/\r?\n/)
	.map((line) => line.trim().replace(/\\/g, '/'))
	.filter((line) => line.length > 0);

if (files.length === 0) {
	failures.push('vsce ls listed no files');
}
for (const file of files) {
	if (!ALLOWED.some((rule) => rule.test(file))) {
		failures.push(`not in the package allowlist: ${file}`);
	}
}
if (!files.includes('dist/extension.js')) {
	failures.push('dist/extension.js is missing from the package');
}

let bundle = '';
try {
	bundle = readFileSync(join(root, 'dist', 'extension.js'), 'utf8');
} catch (error) {
	failures.push(`cannot read dist/extension.js: ${error.message}`);
}
for (const { name, pattern } of TOKEN_PATTERNS) {
	if (pattern.test(bundle)) {
		failures.push(`dist/extension.js contains a token-like string (${name})`);
	}
}

if (failures.length > 0) {
	console.error('Package check failed:');
	for (const failure of failures) {
		console.error(`  - ${failure}`);
	}
	process.exit(1);
}
console.log(`Package check passed: ${files.length} files, all in the allowlist; no token-like strings in dist/extension.js.`);
