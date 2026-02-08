import * as vscode from 'vscode';
import { TclDefinitionProvider } from './definitionProvider';
import { TclIndexer } from './indexer';
import { TclPreviewProvider } from './previewProvider';
import { TclCompletionProvider } from './completionProvider';

export function activate(context: vscode.ExtensionContext) {
  const indexer = new TclIndexer();
  indexer.activate(context);
  indexer.activate(context);
  const diagnostics = vscode.languages.createDiagnosticCollection('tcl');
  context.subscriptions.push(diagnostics);

  const runLint = async () => {
    const lintResults = await indexer.lint();
    diagnostics.clear();
    for (const r of lintResults) {
      diagnostics.set(r.uri, r.diagnostics);
    }
  };

  // initial lint and whenever the index changes
  runLint();
  indexer.onDidIndex(runLint, null, context.subscriptions);

  const defProvider = new TclDefinitionProvider(indexer);
  const defDisposable = vscode.languages.registerDefinitionProvider({ language: 'tcl' }, defProvider);
  context.subscriptions.push(defDisposable);

  const hoverProvider = new TclPreviewProvider(indexer);
  const hoverDisposable = vscode.languages.registerHoverProvider({ language: 'tcl' }, hoverProvider);
  context.subscriptions.push(hoverDisposable);

  const completionProvider = new TclCompletionProvider(indexer);
  const completionDisposable = vscode.languages.registerCompletionItemProvider({ language: 'tcl' }, completionProvider, '(');
  context.subscriptions.push(completionDisposable);
    const signatureProvider = new (require('./signatureProvider').TclSignatureProvider)(indexer);
    const sigDisposable = vscode.languages.registerSignatureHelpProvider({ language: 'tcl' }, signatureProvider, '(', ',');
    context.subscriptions.push(sigDisposable);
    // semantic tokens (type-aware highlighting)
    const legend = new vscode.SemanticTokensLegend(['variable', 'function', 'parameter', 'method'], []);
    const semProvider = new (require('./semanticProvider').TclSemanticProvider)(indexer);
    const semDisposable = vscode.languages.registerDocumentSemanticTokensProvider({ language: 'tcl' }, semProvider, legend);
    context.subscriptions.push(semDisposable);
}

export function deactivate() {}
