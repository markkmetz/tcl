import * as vscode from 'vscode';
import { TclIndexer } from './indexer';

export class TclPreviewProvider implements vscode.HoverProvider {
  private indexer: TclIndexer;

  constructor(indexer: TclIndexer) {
    this.indexer = indexer;
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    const wordRange = document.getWordRangeAtPosition(position, /\$?[A-Za-z0-9_:.]+/);
    if (!wordRange) return null;
    let name = document.getText(wordRange);
    if (name.startsWith('$')) name = name.slice(1);

    const entries = await this.indexer.lookupVariable(name);
    if (!entries || !entries.length) return null;

    const lines: string[] = [];
    for (const e of entries) {
      const relPath = vscode.workspace.asRelativePath(e.loc.uri);
      const lineNum = e.loc.range.start.line + 1;
      lines.push(`Defined in ${relPath}:${lineNum}`);
      if (e.value) lines.push(`Value: ${e.value}`);
    }
    const md = new vscode.MarkdownString(lines.join('\n\n'));
    md.isTrusted = true;
    return new vscode.Hover(md, wordRange);
  }
}
