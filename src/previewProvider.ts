import * as vscode from 'vscode';
import { TclIndexer } from './indexer';
import { BUILTINS } from './builtins';

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
    // fallback: check for procedure signatures (respecting file namespace/imports)
    const procSigs = this.indexer.getProcSignatures(name, document);
    if (procSigs.length) {
      lines.push(`**Procedure**: \`${name}\``);

      for (const sig of procSigs) {
        const relPath = vscode.workspace.asRelativePath(sig.loc.uri);
        const lineNum = sig.loc.range.start.line + 1;
        const params = sig.params.length ? sig.params.join(' ') : '(no params)';
        lines.push(`- Params: ${params} — Defined in ${relPath}:${lineNum}`);
      }
    } else {
      // check for built-in commands
      const builtin = BUILTINS[name] || BUILTINS[name.toLowerCase()];
      if (builtin) {
        lines.push(`**Builtin**: \`${name}\``);
        lines.push(builtin.description);
        if (builtin.params && builtin.params.length) lines.push(`**Params:** ${builtin.params.join(' ')}`);
      } else {
        return null;
      }
    }
  }

  const md = new vscode.MarkdownString(lines.join('\n\n'));
  md.isTrusted = true;

  return new vscode.Hover(md, wordRange);
}

}
