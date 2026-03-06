import * as vscode from 'vscode';
import { TclIndexer } from './indexer';

interface TclCodeLensData {
  name: string;
  uri: vscode.Uri;
  line: number;
  character: number;
}

export class TclCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private readonly indexer: TclIndexer) {}

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const sigs = this.indexer.getDocumentSignatures(document);
    return sigs.map(sig => {
      const line = sig.loc.range.start.line;
      const character = sig.loc.range.start.character;
      const range = new vscode.Range(line, 0, line, 0);
      const lens = new vscode.CodeLens(range);
      (lens as any).data = {
        name: sig.normalizedFqName,
        uri: sig.loc.uri,
        line,
        character
      } as TclCodeLensData;
      return lens;
    });
  }

  async resolveCodeLens(codeLens: vscode.CodeLens): Promise<vscode.CodeLens> {
    const data = (codeLens as any).data as TclCodeLensData | undefined;
    if (!data) return codeLens;

    const refs = await this.indexer.findProcMethodReferences(data.name);
    const count = refs.length;
    const title = `used in ${count} location${count === 1 ? '' : 's'}`;

    codeLens.command = {
      title,
      command: 'editor.action.showReferences',
      arguments: [data.uri, new vscode.Position(data.line, data.character), refs]
    };
    return codeLens;
  }
}
