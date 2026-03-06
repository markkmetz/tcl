import * as vscode from 'vscode';
import { TclIndexer } from './indexer';

export class TclDefinitionProvider implements vscode.DefinitionProvider {
  private indexer: TclIndexer;

  constructor(indexer: TclIndexer) {
    this.indexer = indexer;
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Location | vscode.Location[] | null> {
    // Check for variable reference with $
    const varRange = document.getWordRangeAtPosition(position, /\$[A-Za-z0-9_:.]+/);
    if (varRange) {
      const fullName = document.getText(varRange);
      const varName = fullName.slice(1); // strip $
      const varLocations = await this.indexer.lookupVariable(varName, document, position);
      return varLocations.length ? varLocations.map(v => v.loc) : null;
    }

    // Otherwise check for proc/method
    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_:.]+/);
    if (!wordRange) return null;
    const name = document.getText(wordRange);
    const locations = await this.indexer.lookupInContext(name, document, position);
    return locations.length ? locations : null;
  }
}
