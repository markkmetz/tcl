import * as vscode from 'vscode';
import { TclDefinitionProvider } from './definitionProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new TclDefinitionProvider();
  provider.activate(context);
  const disposable = vscode.languages.registerDefinitionProvider({ language: 'tcl' }, provider);
  context.subscriptions.push(disposable);
}

export function deactivate() {}
