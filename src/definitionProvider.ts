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

    // Check for namespace reference (e.g., "namespace eval ::ns1" or "::ns1::proc")
    const line = document.lineAt(position.line).text;
    const linePrefix = line.substring(0, position.character);
    const namespaceEvalMatch = linePrefix.match(/namespace\s+eval\s+::?([A-Za-z0-9_:]+)$/);
    if (namespaceEvalMatch) {
      const nsName = namespaceEvalMatch[1];
      const nsLocations = this.indexer.lookupNamespace(nsName);
      if (nsLocations.length) return nsLocations;
    }

    // Check if cursor is on a namespace qualifier (::ns::)
    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_:.]+/);
    if (!wordRange) return null;
    const name = document.getText(wordRange);
    
    // If name contains ::, try to extract namespace part
    if (name.includes('::')) {
      const parts = name.split('::').filter(Boolean);
      if (parts.length > 1) {
        // Try namespace lookup first (e.g., "ns1" from "ns1::foo")
        const nsName = parts.slice(0, -1).join('::');
        const nsLocations = this.indexer.lookupNamespace(nsName);
        if (nsLocations.length) {
          // Check if cursor is actually on the namespace part
          const colonIndex = name.lastIndexOf('::');
          const relativePos = position.character - wordRange.start.character;
          if (relativePos < colonIndex) {
            return nsLocations;
          }
        }
      }
    }

    // Otherwise check for proc/method
    const locations = await this.indexer.lookupInContext(name, document, position);
    return locations.length ? locations : null;
  }
}
