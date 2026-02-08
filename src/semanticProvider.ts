import * as vscode from 'vscode';
import { TclIndexer } from './indexer';

export class TclSemanticProvider implements vscode.DocumentSemanticTokensProvider {
  private indexer: TclIndexer;

  constructor(indexer: TclIndexer) {
    this.indexer = indexer;
  }

  provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SemanticTokens> {
    const builder = new vscode.SemanticTokensBuilder();
    const tokenTypeMap: Record<string, number> = { variable: 0, function: 1, parameter: 2, method: 3 };

    // highlight proc and method names and their parameters
    const procs = this.indexer.listProcs();
    for (const name of procs) {
      const sigs = this.indexer.getProcSignatures(name);
      for (const s of sigs) {
        const line = s.loc.range.start.line;
        const lineText = document.lineAt(line).text;

        // find name position (fall back to stored loc column)
        let nameCol = s.loc.range.start.character;
        const nameIndex = lineText.indexOf(name);
        if (nameIndex !== -1) nameCol = nameIndex;

        // add token: function or method
        // decide token type based on whether it's a method (name appears in methodIndex)
        // we don't have access to methodIndex here, but signature origin is either proc or method as stored in indexer
        // use heuristic: if name contains '::' treat as function, otherwise check both
        const tokenTypeIndex = tokenTypeMap['function'];
        builder.push(line, nameCol, name.length, tokenTypeIndex, 0);

        // find params block on the same line
        const paramsMatch = lineText.match(/\{([^}]*)\}/);
        if (paramsMatch && paramsMatch.index !== undefined) {
          const paramsRaw = paramsMatch[1];
          let offset = paramsMatch.index + 1; // start of params inside '{'
          const params = paramsRaw.split(/\s+/).filter(Boolean);
          for (const p of params) {
            const pIndex = lineText.indexOf(p, offset);
            if (pIndex !== -1) {
              builder.push(line, pIndex, p.length, tokenTypeMap['parameter'], 0);
              offset = pIndex + p.length;
            }
          }
        }
      }
    }

    // highlight variable declarations
    const vars = this.indexer.listVariables();
    for (const v of vars) {
      const line = v.loc.range.start.line;
      const col = v.loc.range.start.character;
      builder.push(line, col, v.name.length, tokenTypeMap['variable'], 0);
    }

    return builder.build();
  }

}
