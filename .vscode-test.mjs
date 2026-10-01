import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/smoke/**/*.test.js',
	mocha: {
		timeout: 30000,
	},
});
