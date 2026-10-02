import * as assert from 'assert';
import * as vscode from 'vscode';

function findPulley(): vscode.Extension<unknown> | undefined {
	return vscode.extensions.all.find((ext) => ext.packageJSON?.name === 'pulley');
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return predicate();
}

suite('Activation', () => {
	test('activates on startup with no folder open and without opening the view', async () => {
		assert.strictEqual(vscode.workspace.workspaceFolders, undefined, 'expected no folder to be open');
		const ext = findPulley();
		assert.ok(ext, 'Pulley extension is installed in the test host');
		// Do not call ext.activate() or open the view: onStartupFinished must be enough.
		const active = await waitFor(() => ext.isActive, 20000);
		assert.ok(active, 'Pulley activated on startup');
	});

	test('registers pulley.connect', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('pulley.connect'));
		assert.ok(!commands.includes('pulley.helloWorld'), 'scaffold hello-world command removed');
		assert.ok(commands.includes('pulley.openPullRequest'));
		assert.ok(!commands.includes('pulley.debugSeed'), 'debug seed is registered only in Development mode');
	});

	test('registers pulley.refresh and pulley.reconnect', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('pulley.refresh'));
		assert.ok(commands.includes('pulley.reconnect'));
	});

	test('pulley.checkIntervalMinutes defaults to 15', () => {
		const inspected = vscode.workspace.getConfiguration('pulley').inspect<number>('checkIntervalMinutes');
		assert.strictEqual(inspected?.defaultValue, 15);
	});
});
