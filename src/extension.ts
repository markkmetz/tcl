import * as vscode from 'vscode';
import { TclDefinitionProvider } from './definitionProvider';
import { TclIndexer } from './indexer';
import { TclPreviewProvider } from './previewProvider';

export function activate(context: vscode.ExtensionContext) {
  const indexer = new TclIndexer();
  indexer.activate(context);

  const defProvider = new TclDefinitionProvider(indexer);
  const defDisposable = vscode.languages.registerDefinitionProvider({ language: 'tcl' }, defProvider);
  context.subscriptions.push(defDisposable);

  const hoverProvider = new TclPreviewProvider(indexer);
  const hoverDisposable = vscode.languages.registerHoverProvider({ language: 'tcl' }, hoverProvider);
  context.subscriptions.push(hoverDisposable);
}

export function deactivate() {}
