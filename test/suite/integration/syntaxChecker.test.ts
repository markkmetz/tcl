import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  ensureExtensionActive,
  openFixture,
  sleep,
} from './helpers';

async function waitForSyntaxDiagnostics(uri: vscode.Uri, timeoutMs = 7000): Promise<vscode.Diagnostic[]> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const diagnostics = vscode.languages.getDiagnostics(uri).filter(d => d.source === 'tcl-syntax');
    if (diagnostics.length > 0) {
      return diagnostics;
    }
    await sleep(250);
  }
  return vscode.languages.getDiagnostics(uri).filter(d => d.source === 'tcl-syntax');
}

async function waitForSyntaxStabilization(uri: vscode.Uri, timeoutMs = 7000): Promise<vscode.Diagnostic[]> {
  const started = Date.now();
  let previousSignature = '';
  while (Date.now() - started < timeoutMs) {
    const diagnostics = vscode.languages.getDiagnostics(uri).filter(d => d.source === 'tcl-syntax');
    const signature = diagnostics.map(d => `${d.range.start.line}:${d.message}`).join('|');
    if (signature === previousSignature) {
      return diagnostics;
    }
    previousSignature = signature;
    await sleep(300);
  }
  return vscode.languages.getDiagnostics(uri).filter(d => d.source === 'tcl-syntax');
}

function hasMissingExternalChecker(diagnostics: vscode.Diagnostic[]): boolean {
  return diagnostics.some(d => {
    const message = d.message.toLowerCase();
    return (
      message.includes('failed to run tclsh') ||
      (message.includes('external checker failed') && message.includes('enoent'))
    );
  });
}

suite('Syntax Checker Integration', () => {
  let previousMode: string | undefined;
  let previousImportMode: string | undefined;

  suiteSetup(async () => {
    await ensureExtensionActive();

    const cfg = vscode.workspace.getConfiguration('tcl.runtime');
    previousMode = cfg.get<string>('syntaxCheckMode');
    previousImportMode = cfg.get<string>('syntaxCheckImports');

    await cfg.update('syntaxCheckMode', 'local', vscode.ConfigurationTarget.Global);
    await cfg.update('syntaxCheckImports', 'currentOnly', vscode.ConfigurationTarget.Global);
    await sleep(750);
  });

  suiteTeardown(async () => {
    const cfg = vscode.workspace.getConfiguration('tcl.runtime');

    if (previousMode === undefined) {
      await cfg.update('syntaxCheckMode', undefined, vscode.ConfigurationTarget.Global);
    } else {
      await cfg.update('syntaxCheckMode', previousMode, vscode.ConfigurationTarget.Global);
    }

    if (previousImportMode === undefined) {
      await cfg.update('syntaxCheckImports', undefined, vscode.ConfigurationTarget.Global);
    } else {
      await cfg.update('syntaxCheckImports', previousImportMode, vscode.ConfigurationTarget.Global);
    }

    await closeAllEditors();
  });

  test('wrong # args diagnostic maps near call site line', async function () {
    const { doc } = await openFixture('syntax-errors/wrong-args.tcl', 500);

    await doc.save();
    const diagnostics = await waitForSyntaxDiagnostics(doc.uri);
    assert.ok(diagnostics.length > 0, 'Expected syntax diagnostics for wrong-args fixture');

    if (hasMissingExternalChecker(diagnostics)) {
      this.skip();
      return;
    }

    const wrongArgsDiag = diagnostics.find(d => d.message.toLowerCase().includes('wrong # args'));
    assert.ok(wrongArgsDiag, `Expected wrong # args diagnostic, got: ${diagnostics.map(d => d.message).join(' | ')}`);

    const expectedLine = doc
      .getText()
      .split(/\r?\n/)
      .findIndex(line => line.includes('[addTwo 10]'));
    assert.ok(expectedLine >= 0, 'Could not find expected call-site line in fixture');

    const actualLine = wrongArgsDiag!.range.start.line;
    assert.ok(
      Math.abs(actualLine - expectedLine) <= 1,
      `Expected diagnostic near line ${expectedLine + 1}, got ${actualLine + 1}`
    );
  });

  test('import preload mode affects cross-file callable resolution', async function () {
    const cfg = vscode.workspace.getConfiguration('tcl.runtime');

    await cfg.update('syntaxCheckImports', 'currentOnly', vscode.ConfigurationTarget.Global);
    await sleep(500);

    const { doc } = await openFixture('syntax-errors/source-order-a.tcl', 500);
    await doc.save();
    const currentOnlyDiagnostics = await waitForSyntaxDiagnostics(doc.uri);

    if (hasMissingExternalChecker(currentOnlyDiagnostics)) {
      this.skip();
      return;
    }

    assert.ok(
      currentOnlyDiagnostics.some(d => d.message.toLowerCase().includes('invalid command name') || d.message.toLowerCase().includes('sharedproc')),
      `Expected currentOnly mode to surface missing shared proc; got: ${currentOnlyDiagnostics.map(d => d.message).join(' | ')}`
    );

    await cfg.update('syntaxCheckImports', 'all', vscode.ConfigurationTarget.Global);
    await sleep(800);
    await doc.save();

    const allModeDiagnostics = await waitForSyntaxStabilization(doc.uri);
    assert.ok(
      !allModeDiagnostics.some(d => d.message.toLowerCase().includes('invalid command name') || d.message.toLowerCase().includes('sharedproc')),
      `Expected shared proc resolution to improve in all mode; got: ${allModeDiagnostics.map(d => d.message).join(' | ')}`
    );
  });
});
