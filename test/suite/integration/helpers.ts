import * as vscode from 'vscode';
import * as path from 'path';

/** Compiled to out/test/suite/integration/ — four levels up is the workspace root. */
const FIXTURES_ROOT = path.resolve(__dirname, '../../../../test/fixtures');

export function fixturePath(name: string): string {
  return path.join(FIXTURES_ROOT, name);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface DiagnosticStabilityOptions {
  timeoutMs?: number;
  intervalMs?: number;
  stableIterations?: number;
  minWaitMs?: number;
}

export interface LightweightRuntimeConfigSnapshot {
  syntaxCheckMode?: string;
  syntaxCheckDelay?: number;
  syntaxCheckImports?: string;
  lightweightUsageAnalysis?: boolean;
}

/**
 * Ensure the extension is activated. Opening a .tcl document triggers
 * `onLanguage:tcl` activation automatically, but this provides an explicit
 * fallback for test setup.
 */
export async function ensureExtensionActive(): Promise<void> {
  const ext = vscode.extensions.getExtension('kmetzenterprises.marks-tcl-extension');
  if (!ext) {
    throw new Error('marks-tcl-extension not found — check extensionDevelopmentPath');
  }
  if (!ext.isActive) {
    await ext.activate();
  }
}

/**
 * Open a fixture file as a VS Code text document and show it in the editor.
 * Waits for the indexer to finish by sleeping `indexerWait` ms.
 */
export async function openFixture(
  name: string,
  indexerWait = 2500
): Promise<{ doc: vscode.TextDocument; editor: vscode.TextEditor }> {
  const uri = vscode.Uri.file(fixturePath(name));
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  await sleep(indexerWait);
  return { doc, editor };
}

/** Extract plain string labels from a CompletionList. */
export function completionLabels(list: vscode.CompletionList): string[] {
  return list.items.map(item =>
    typeof item.label === 'string' ? item.label : item.label.label
  );
}

/** Extract the markdown value from a Hover's first content entry. */
export function hoverText(hovers: vscode.Hover[]): string {
  if (!hovers || hovers.length === 0) { return ''; }
  const content = hovers[0].contents[0];
  if (typeof content === 'string') { return content; }
  if ('value' in content) { return (content as vscode.MarkdownString).value; }
  return '';
}

/** Close all open editors to reset state between test files. */
export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await sleep(200);
}

export function tclSyntaxDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
  return vscode.languages.getDiagnostics(uri).filter(d => d.source === 'tcl-syntax');
}

export function diagnosticSignature(diagnostics: vscode.Diagnostic[]): string {
  return diagnostics
    .map(d => `${d.range.start.line}:${d.severity}:${d.message}`)
    .sort()
    .join('|');
}

export async function waitForDiagnosticStability(
  uri: vscode.Uri,
  options: DiagnosticStabilityOptions = {}
): Promise<vscode.Diagnostic[]> {
  const timeoutMs = options.timeoutMs ?? 7000;
  const intervalMs = options.intervalMs ?? 250;
  const stableIterations = options.stableIterations ?? 3;
  const minWaitMs = options.minWaitMs ?? 0;

  const started = Date.now();
  let previousSignature = '';
  let unchanged = 0;
  let latestDiagnostics: vscode.Diagnostic[] = [];

  while (Date.now() - started < timeoutMs) {
    latestDiagnostics = tclSyntaxDiagnostics(uri);
    const signature = diagnosticSignature(latestDiagnostics);

    if (signature === previousSignature) {
      unchanged += 1;
      if (unchanged >= stableIterations && Date.now() - started >= minWaitMs) {
        return latestDiagnostics;
      }
    } else {
      previousSignature = signature;
      unchanged = 1;
    }

    await sleep(intervalMs);
  }

  return latestDiagnostics;
}

export async function collectDiagnosticSignatures(
  uri: vscode.Uri,
  windowMs: number,
  intervalMs = 200
): Promise<string[]> {
  const signatures: string[] = [];
  const started = Date.now();

  while (Date.now() - started < windowMs) {
    signatures.push(diagnosticSignature(tclSyntaxDiagnostics(uri)));
    await sleep(intervalMs);
  }

  return signatures;
}

export function countSignatureTransitions(signatures: string[]): number {
  if (signatures.length <= 1) {
    return 0;
  }

  let transitions = 0;
  let previous = signatures[0];
  for (let i = 1; i < signatures.length; i++) {
    if (signatures[i] !== previous) {
      transitions += 1;
      previous = signatures[i];
    }
  }

  return transitions;
}

export async function setLightweightRuntimeConfig(): Promise<LightweightRuntimeConfigSnapshot> {
  const cfg = vscode.workspace.getConfiguration('tcl.runtime');
  const snapshot: LightweightRuntimeConfigSnapshot = {
    syntaxCheckMode: cfg.get<string>('syntaxCheckMode'),
    syntaxCheckDelay: cfg.get<number>('syntaxCheckDelay'),
    syntaxCheckImports: cfg.get<string>('syntaxCheckImports'),
    lightweightUsageAnalysis: cfg.get<boolean>('lightweightUsageAnalysis'),
  };

  await cfg.update('syntaxCheckMode', 'lightweight', vscode.ConfigurationTarget.Global);
  await cfg.update('syntaxCheckDelay', 1, vscode.ConfigurationTarget.Global);
  await cfg.update('syntaxCheckImports', 'currentOnly', vscode.ConfigurationTarget.Global);
  await cfg.update('lightweightUsageAnalysis', true, vscode.ConfigurationTarget.Global);
  await sleep(750);

  return snapshot;
}

export async function restoreRuntimeConfig(snapshot: LightweightRuntimeConfigSnapshot): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('tcl.runtime');
  await cfg.update('syntaxCheckMode', snapshot.syntaxCheckMode, vscode.ConfigurationTarget.Global);
  await cfg.update('syntaxCheckDelay', snapshot.syntaxCheckDelay, vscode.ConfigurationTarget.Global);
  await cfg.update('syntaxCheckImports', snapshot.syntaxCheckImports, vscode.ConfigurationTarget.Global);
  await cfg.update('lightweightUsageAnalysis', snapshot.lightweightUsageAnalysis, vscode.ConfigurationTarget.Global);
  await sleep(250);
}
