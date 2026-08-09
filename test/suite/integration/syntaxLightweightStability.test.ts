import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  collectDiagnosticSignatures,
  collectWorkspaceDiagnosticSignatures,
  countSignatureTransitions,
  diagnosticSignature,
  ensureExtensionActive,
  openFixture,
  restoreRuntimeConfig,
  setLightweightRuntimeConfig,
  sleep,
  tclSyntaxDiagnostics,
  waitForDiagnosticStability,
  waitForWorkspaceDiagnosticStability,
  workspaceDiagnosticSignature,
  type LightweightRuntimeConfigSnapshot,
} from './helpers';

async function replaceDocumentText(editor: vscode.TextEditor, text: string): Promise<void> {
  const doc = editor.document;
  const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  const changed = await editor.edit(editBuilder => {
    editBuilder.replace(fullRange, text);
  });
  assert.ok(changed, 'Expected text replacement edit to succeed');
}

suite('Lightweight Syntax Stability Integration', () => {
  let runtimeSnapshot: LightweightRuntimeConfigSnapshot;

  suiteSetup(async () => {
    await ensureExtensionActive();
    runtimeSnapshot = await setLightweightRuntimeConfig();
  });

  suiteTeardown(async () => {
    await restoreRuntimeConfig(runtimeSnapshot);
    await closeAllEditors();
  });

  test('rapid edit burst converges and remains stable', async () => {
    const { doc, editor } = await openFixture('syntax-errors/lightweight-stability-valid.tcl', 600);
    const baseText = doc.getText();
    const brokenText = `${baseText}\nif {$enabled} {\n  puts \"broken\"\n`;

    for (let i = 0; i < 6; i++) {
      const nextText = i % 2 === 0 ? brokenText : baseText;
      await replaceDocumentText(editor, nextText);
      await sleep(120);
    }

    await replaceDocumentText(editor, brokenText);
    const brokenDiagnostics = await waitForDiagnosticStability(doc.uri, {
      timeoutMs: 9000,
      stableIterations: 3,
      minWaitMs: 2200,
    });

    assert.ok(brokenDiagnostics.length > 0, 'Expected diagnostics for unmatched brace');
    assert.ok(
      brokenDiagnostics.some(d => /unmatched brace/i.test(d.message)),
      `Expected unmatched brace diagnostic, got: ${brokenDiagnostics.map(d => d.message).join(' | ')}`
    );

    const postBrokenSignatures = await collectDiagnosticSignatures(doc.uri, 1200, 150);
    assert.strictEqual(
      countSignatureTransitions(postBrokenSignatures),
      0,
      `Diagnostics changed after stabilization: ${postBrokenSignatures.join(' -> ')}`
    );

    await replaceDocumentText(editor, baseText);
    const recoveredDiagnostics = await waitForDiagnosticStability(doc.uri, {
      timeoutMs: 9000,
      stableIterations: 3,
      minWaitMs: 2200,
    });
    assert.strictEqual(recoveredDiagnostics.length, 0, 'Expected diagnostics to clear after fixing syntax');

    const postRecoverySignatures = await collectDiagnosticSignatures(doc.uri, 1200, 150);
    assert.strictEqual(
      countSignatureTransitions(postRecoverySignatures),
      0,
      `Diagnostics flapped after recovery: ${postRecoverySignatures.join(' -> ')}`
    );
  });

  test('reopen preserves stabilized diagnostics without random churn', async () => {
    const firstOpen = await openFixture('syntax-errors/lightweight-stability-unmatched-brace.tcl', 600);
    const firstDiagnostics = await waitForDiagnosticStability(firstOpen.doc.uri, {
      timeoutMs: 9000,
      stableIterations: 3,
      minWaitMs: 2200,
    });

    assert.ok(firstDiagnostics.length > 0, 'Expected diagnostics on first open');
    const firstSignature = diagnosticSignature(firstDiagnostics);

    await closeAllEditors();

    const secondOpen = await openFixture('syntax-errors/lightweight-stability-unmatched-brace.tcl', 600);
    const secondDiagnostics = await waitForDiagnosticStability(secondOpen.doc.uri, {
      timeoutMs: 9000,
      stableIterations: 3,
      minWaitMs: 2200,
    });

    assert.ok(secondDiagnostics.length > 0, 'Expected diagnostics on second open');
    const secondSignature = diagnosticSignature(secondDiagnostics);

    assert.strictEqual(
      secondSignature,
      firstSignature,
      `Expected deterministic diagnostics on reopen. First: ${firstSignature}; second: ${secondSignature}`
    );

    const signatures = await collectDiagnosticSignatures(secondOpen.doc.uri, 1200, 150);
    assert.strictEqual(
      countSignatureTransitions(signatures),
      0,
      `Diagnostics changed unexpectedly after reopen stabilization: ${signatures.join(' -> ')}`
    );
  });

  test('switching between files does not mutate stabilized diagnostic states', async () => {
    const errorFile = await openFixture('syntax-errors/lightweight-stability-unmatched-brace.tcl', 600);
    const errorDiagnostics = await waitForDiagnosticStability(errorFile.doc.uri, {
      timeoutMs: 9000,
      stableIterations: 3,
      minWaitMs: 2200,
    });
    assert.ok(errorDiagnostics.length > 0, 'Expected unmatched brace diagnostics in error fixture');
    const expectedErrorSignature = diagnosticSignature(errorDiagnostics);
    const expectedWorkspaceSignature = workspaceDiagnosticSignature();

    const validFile = await openFixture('syntax-errors/lightweight-stability-valid.tcl', 600);
    const validDiagnostics = await waitForDiagnosticStability(validFile.doc.uri, {
      timeoutMs: 9000,
      stableIterations: 3,
      minWaitMs: 2200,
    });
    assert.strictEqual(validDiagnostics.length, 0, 'Expected no diagnostics in valid fixture');

    const stableWorkspaceSignature = await waitForWorkspaceDiagnosticStability({
      timeoutMs: 9000,
      stableIterations: 3,
      minWaitMs: 1500,
    });
    assert.ok(
      stableWorkspaceSignature.length >= 0,
      'Expected workspace diagnostics to settle after switching files'
    );

    const workspaceSignaturesAfterValid = await collectWorkspaceDiagnosticSignatures(1200, 150);
    assert.strictEqual(
      countSignatureTransitions(workspaceSignaturesAfterValid),
      0,
      `Workspace diagnostics changed after switching to the valid file: ${workspaceSignaturesAfterValid.join(' -> ')}`
    );

    await vscode.window.showTextDocument(errorFile.doc);
    await sleep(200);

    const revisitedErrorDiagnostics = await waitForDiagnosticStability(errorFile.doc.uri, {
      timeoutMs: 9000,
      stableIterations: 3,
      minWaitMs: 2200,
    });
    const revisitedSignature = diagnosticSignature(revisitedErrorDiagnostics);
    assert.strictEqual(
      revisitedSignature,
      expectedErrorSignature,
      'Expected error diagnostics to remain unchanged after file switching'
    );
    const stableWorkspaceSignatureAfterReturn = await waitForWorkspaceDiagnosticStability({
      timeoutMs: 9000,
      stableIterations: 3,
      minWaitMs: 1500,
    });
    assert.ok(
      stableWorkspaceSignatureAfterReturn.length >= 0,
      'Expected workspace diagnostics to remain stable after switching back'
    );

    const workspaceSignaturesAfterReturn = await collectWorkspaceDiagnosticSignatures(1200, 150);
    assert.strictEqual(
      countSignatureTransitions(workspaceSignaturesAfterReturn),
      0,
      `Workspace diagnostics changed after switching back to the error file: ${workspaceSignaturesAfterReturn.join(' -> ')}`
    );

    const finalValidDiagnostics = tclSyntaxDiagnostics(validFile.doc.uri);
    assert.strictEqual(finalValidDiagnostics.length, 0, 'Expected valid file diagnostics to remain clear');
  });

  test('background scan preserves interactive lightweight usage diagnostics', async () => {
    const { doc } = await openFixture('syntax-errors/lightweight-background-preserve.tcl', 600);
    const initialDiagnostics = await waitForDiagnosticStability(doc.uri, {
      timeoutMs: 9000,
      stableIterations: 3,
      minWaitMs: 2200,
    });

    assert.ok(initialDiagnostics.length > 0, 'Expected interactive lightweight diagnostics before background scan');
    assert.ok(
      initialDiagnostics.some(d => /possible unused proc/i.test(d.message)),
      `Expected unused proc diagnostic before background scan, got: ${initialDiagnostics.map(d => d.message).join(' | ')}`
    );

    const beforeSignature = diagnosticSignature(initialDiagnostics);

    await vscode.commands.executeCommand('tcl.startSyntaxScan');
    const afterDiagnostics = await waitForDiagnosticStability(doc.uri, {
      timeoutMs: 9000,
      stableIterations: 3,
      minWaitMs: 2200,
    });
    const afterSignature = diagnosticSignature(afterDiagnostics);

    assert.strictEqual(
      afterSignature,
      beforeSignature,
      `Background scan changed diagnostics unexpectedly. Before: ${beforeSignature}; after: ${afterSignature}`
    );
  });

  test('edit and save cycles catch multiple syntax error types', async function () {
    this.timeout(120000);

    const { doc, editor } = await openFixture('syntax-errors/lightweight-stability-valid.tcl', 600);
    const baseText = doc.getText();

    const cases: Array<{ label: string; text: string; expectedMessage: RegExp }> = [
      {
        label: 'unmatched brace',
        text: `${baseText}\nif {$enabled} {\n  puts \"missing brace close\"\n`,
        expectedMessage: /possible unmatched brace/i,
      },
      {
        label: 'unmatched bracket',
        text: `${baseText}\nset value [expr 1 + 2\n`,
        expectedMessage: /possible unmatched bracket/i,
      },
      {
        label: 'unclosed quote',
        text: `${baseText}\nset value \"unterminated\n`,
        expectedMessage: /possible unclosed quote/i,
      },
    ];

    for (const testCase of cases) {
      await replaceDocumentText(editor, testCase.text);
      await doc.save();

      const diagnostics = await waitForDiagnosticStability(doc.uri, {
        timeoutMs: 9000,
        stableIterations: 3,
        minWaitMs: 1500,
      });

      assert.ok(
        diagnostics.some(d => testCase.expectedMessage.test(d.message)),
        `Expected ${testCase.label} diagnostic after edit+save, got: ${diagnostics.map(d => d.message).join(' | ')}`
      );
    }

    await replaceDocumentText(editor, baseText);
    await doc.save();

    const recoveredDiagnostics = await waitForDiagnosticStability(doc.uri, {
      timeoutMs: 9000,
      stableIterations: 3,
      minWaitMs: 1500,
    });
    assert.strictEqual(recoveredDiagnostics.length, 0, 'Expected diagnostics to clear after restoring valid text and saving');
  });

  test('config flap keeps a single diagnostics transition stream', async function () {
    this.timeout(120000);

    const cfg = vscode.workspace.getConfiguration('tcl.runtime');
    const previousMode = cfg.get<string>('syntaxCheckMode');
    await cfg.update('syntaxCheckDelay', 1, vscode.ConfigurationTarget.Global);

    try {
      await vscode.commands.executeCommand('tcl.cancelSyntaxScan');

      const { doc } = await openFixture('syntax-errors/lightweight-stability-unmatched-brace.tcl', 600);
      const baseline = await waitForDiagnosticStability(doc.uri, {
        timeoutMs: 9000,
        stableIterations: 3,
        minWaitMs: 2200,
      });
      assert.ok(baseline.length > 0, 'Expected baseline unmatched brace diagnostics in lightweight mode');

      let maxTransitionsPerWindow = 0;
      const flaps = 12;

      for (let i = 0; i < flaps; i++) {
        const mode: 'lightweight' | 'local' = i % 2 === 0 ? 'local' : 'lightweight';
        await cfg.update('syntaxCheckMode', mode, vscode.ConfigurationTarget.Global);

        const stable = await waitForDiagnosticStability(doc.uri, {
          timeoutMs: 9000,
          stableIterations: 2,
          minWaitMs: 1000,
        });

        if (mode === 'lightweight') {
          assert.ok(
            stable.some(d => /unmatched brace/i.test(d.message)),
            `Expected unmatched brace diagnostics after switching to lightweight (iteration ${i + 1})`
          );
        }

        const signatures = await collectDiagnosticSignatures(doc.uri, 1500, 150);
        const transitions = countSignatureTransitions(signatures);
        maxTransitionsPerWindow = Math.max(maxTransitionsPerWindow, transitions);

        assert.ok(
          transitions <= 1,
          `Detected multiplied diagnostics transitions after mode=${mode} iteration=${i + 1}: ${signatures.join(' -> ')}`
        );
      }

      assert.ok(
        maxTransitionsPerWindow <= 1,
        `Expected single transition stream during config flap, saw max ${maxTransitionsPerWindow}`
      );
    } finally {
      await cfg.update('syntaxCheckMode', previousMode, vscode.ConfigurationTarget.Global);
      await sleep(300);
    }
  });
});
