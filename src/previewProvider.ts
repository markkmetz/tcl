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
  // get the current word (variable or proc name)
  const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_:.]+/);
  if (!wordRange) return null;

  let name = document.getText(wordRange);

  // strip leading $ if present (variable reference)
  if (name.startsWith('$')) name = name.slice(1);

  // check for variable entries first
  const varEntries = await this.indexer.lookupVariable(name);

  const lines: string[] = [];

  if (varEntries && varEntries.length) {
    for (const e of varEntries) {
      const relPath = vscode.workspace.asRelativePath(e.loc.uri);
      const lineNum = e.loc.range.start.line + 1;
      lines.push(`**Variable**: \`${name}\``);
      lines.push(`Defined in ${relPath}:${lineNum}`);
      if (e.value) lines.push(`Value:\n\`\`\`\n${e.value}\n\`\`\``);
    }
  } else {
    // fallback: check for procedure signatures
    const procSigs = this.indexer.getProcSignatures(name);
    if (!procSigs.length) return null;

    lines.push(`**Procedure**: \`${name}\``);

    for (const sig of procSigs) {
      const relPath = vscode.workspace.asRelativePath(sig.loc.uri);
      const lineNum = sig.loc.range.start.line + 1;
      const params = sig.params.length ? sig.params.join(' ') : '(no params)';
      lines.push(`- Params: ${params} — Defined in ${relPath}:${lineNum}`);
    }
  }

  const md = new vscode.MarkdownString(lines.join('\n\n'));
  md.isTrusted = true;

  return new vscode.Hover(md, wordRange);
}

}
