import * as vscode from 'vscode';
import { TclIndexer } from './indexer';

export class TclSignatureProvider implements vscode.SignatureHelpProvider {
  private indexer: TclIndexer;

  constructor(indexer: TclIndexer) {
    this.indexer = indexer;
  }

  provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.SignatureHelpContext
  ): vscode.ProviderResult<vscode.SignatureHelp> {
    // find the token (function name) before the '('
    const line = document.lineAt(position.line).text.substring(0, position.character);
    const m = line.match(/([A-Za-z0-9_:.]+)\s*\($/);
    if (!m) return null;
    const name = m[1];
    const sigs = this.indexer.getProcSignatures(name);
    if (!sigs || !sigs.length) return null;

    const signatureHelp = new vscode.SignatureHelp();
    signatureHelp.activeSignature = 0;
    signatureHelp.activeParameter = 0;

    for (const s of sigs) {
      const params = s.params.map(p => new vscode.ParameterInformation(p));
      const sigInfo = new vscode.SignatureInformation(`${name}(${s.params.join(', ')})`);
      sigInfo.parameters = params;
      signatureHelp.signatures.push(sigInfo);
    }

    return signatureHelp;
  }
}
