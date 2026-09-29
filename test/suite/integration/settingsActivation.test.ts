import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TclIndexer } from '../../../src/indexer';
import { ensureExtensionActive, sleep } from './helpers';

suite('Settings activation safety', () => {
  test('handles stale externalPaths setting without rejecting', async function () {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder || path.basename(workspaceFolder.uri.fsPath) !== 'invalid-settings') {
      this.skip();
    }

    const unhandledRejections: unknown[] = [];
    const captureUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', captureUnhandledRejection);
    try {
      await ensureExtensionActive();
      await sleep(50);
    } finally {
      process.off('unhandledRejection', captureUnhandledRejection);
    }
    assert.deepStrictEqual(
      unhandledRejections,
      [],
      'Stale externalPaths must not cause an unhandled rejection during extension activation'
    );

    const settingsPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'settings.json');
    assert.ok(fs.existsSync(settingsPath), 'Activation must not delete the VS Code settings file');

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.deepStrictEqual(settings, {
      'tcl.runtime.syntaxCheckMode': 'unsupported-mode',
      'tcl.runtime.syntaxCheckDelay': 'not-an-integer',
      'tcl.index.externalPaths': { length: 1, stalePreviousVersionValue: true },
      'tcl.features.lint': true,
      'tcl.legacy.missingSetting': true,
      'json.schemaDownload.enable': false,
    });

    const staleExternalPaths = vscode.workspace
      .getConfiguration('tcl')
      .get<unknown>('index.externalPaths');
    assert.deepStrictEqual(staleExternalPaths, {
      length: 1,
      stalePreviousVersionValue: true,
    }, 'VS Code must expose the stale value being exercised');
    await assert.doesNotReject(new TclIndexer().setExternalPaths(staleExternalPaths));
  });
});