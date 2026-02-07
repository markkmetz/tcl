import * as vscode from 'vscode';
import { TclIndexer } from './indexer';

export class TclCompletionProvider implements vscode.CompletionItemProvider {
  private indexer: TclIndexer;

  constructor(indexer: TclIndexer) {
    this.indexer = indexer;
  }

async provideCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken,
  context: vscode.CompletionContext
): Promise<vscode.CompletionItem[] | vscode.CompletionList> {

  // get the current word prefix
  const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_:.]+/);
  const prefix = wordRange ? document.getText(wordRange) : '';

  const procs = this.indexer.listProcs(prefix);
  const items: vscode.CompletionItem[] = [];

  for (const procName of procs) {
    const item = new vscode.CompletionItem(procName, vscode.CompletionItemKind.Function);

    // get all signatures for documentation
    const signatures = this.indexer.getProcSignatures(procName);
    const procLines = signatures.map(sig => {
      const rel = vscode.workspace.asRelativePath(sig.loc.uri);
      const lineNum = sig.loc.range.start.line + 1;
      const params = sig.params.length ? sig.params.join(' ') : '(no params)';
      return `- ${params} — Defined in ${rel}:${lineNum}`;
    });

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**Signature**\n\n`);
    if (procLines.length) md.appendMarkdown(procLines.join('\n'));
    else md.appendMarkdown('_Signature not found_');
    item.documentation = md;

    // build snippet using the first signature that has parameters
    const sigWithParams = signatures.find(s => Array.isArray(s.params) && s.params.length > 0);

    if (sigWithParams) {
      // placeholders separated by spaces (Tcl style)
      const snippetText = `${procName} ${sigWithParams.params
        .map((param, idx) => `\${${idx + 1}:${param}}`)
        .join(' ')}$0`;
      item.insertText = new vscode.SnippetString(snippetText);
    } else {
      // no-parameter proc
      item.insertText = new vscode.SnippetString(`${procName}$0`);
    }

    items.push(item);
  }

  return items;
}
}
