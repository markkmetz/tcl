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
