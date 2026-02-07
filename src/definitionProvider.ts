import * as vscode from 'vscode';
import { TclIndexer } from './indexer';

export class TclDefinitionProvider implements vscode.DefinitionProvider {
  private indexer: TclIndexer;

  constructor() {
    this.indexer = new TclIndexer();
  }

  activate(context: vscode.ExtensionContext) {
    this.indexer.activate(context);
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Location | vscode.Location[] | null> {
    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_:.]+/);
    if (!wordRange) return null;
    const name = document.getText(wordRange);
    const locations = await this.indexer.lookup(name);
    return locations.length ? locations : null;
  }
}
