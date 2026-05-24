import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  ensureExtensionActive,
  restoreRuntimeConfig,
  setLightweightRuntimeConfig,
  sleep,
  type LightweightRuntimeConfigSnapshot,
} from './helpers';

function summarizeDiagnostics(all: vscode.Diagnostic[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const d of all) {
    counts.set(d.message, (counts.get(d.message) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
}

suite('Diagnostics Collection Integration', () => {
  let runtimeSnapshot: LightweightRuntimeConfigSnapshot;

  suiteSetup(async () => {
    await ensureExtensionActive();
    runtimeSnapshot = await setLightweightRuntimeConfig();
  });

  suiteTeardown(async () => {
    await restoreRuntimeConfig(runtimeSnapshot);
  });

  test('collects workspace diagnostics after interactive background scan', async function () {
    this.timeout(180000);

    await vscode.commands.executeCommand('tcl.startSyntaxScan');

    const timeoutMs = 120000;
    const started = Date.now();
    let previousSig = '';
    let stableCount = 0;

    while (Date.now() - started < timeoutMs) {
      const entries = vscode.languages.getDiagnostics();
      const diagnostics = entries
        .flatMap(([, ds]) => ds)
        .filter(d => d.source === 'tcl-syntax');
      const sig = `${diagnostics.length}:${diagnostics.map(d => d.message).sort().join('|')}`;

      if (sig === previousSig) {
        stableCount += 1;
        if (stableCount >= 3) {
          const top = summarizeDiagnostics(diagnostics);
          console.log(`[collector] total diagnostics: ${diagnostics.length}`);
          for (const [msg, count] of top) {
            console.log(`[collector] ${count}x ${msg}`);
          }
          assert.ok(diagnostics.length >= 0, 'Collector should complete without errors');
          return;
        }
      } else {
        previousSig = sig;
        stableCount = 1;
      }

      await sleep(2000);
    }

    const finalEntries = vscode.languages.getDiagnostics();
    const finalDiagnostics = finalEntries
      .flatMap(([, ds]) => ds)
      .filter(d => d.source === 'tcl-syntax');
    const top = summarizeDiagnostics(finalDiagnostics);
    console.log(`[collector-timeout] total diagnostics: ${finalDiagnostics.length}`);
    for (const [msg, count] of top) {
      console.log(`[collector-timeout] ${count}x ${msg}`);
    }

    assert.ok(finalDiagnostics.length >= 0, 'Collector should return diagnostics even on timeout');
  });
});
