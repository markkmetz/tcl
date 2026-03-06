import * as vscode from 'vscode';
import { TclIndexer } from './indexer';

export class TclReferenceProvider implements vscode.ReferenceProvider {
  constructor(private readonly indexer: TclIndexer) {}

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext
  ): Promise<vscode.Location[]> {
    const range = document.getWordRangeAtPosition(position, /[A-Za-z0-9_:.]+/);
    if (!range) return [];

    const name = document.getText(range);
    const refs = await this.indexer.findProcMethodReferences(name, document);

    if (!context.includeDeclaration) return refs;

    const declarations = this.indexer.getProcSignatures(name, document).map(s => s.loc);
    const all = [...declarations, ...refs];

    const dedupe = new Map<string, vscode.Location>();
    for (const loc of all) {
      const key = `${loc.uri.toString()}:${loc.range.start.line}:${loc.range.start.character}`;
      if (!dedupe.has(key)) dedupe.set(key, loc);
    }
    return Array.from(dedupe.values());
  }
}
