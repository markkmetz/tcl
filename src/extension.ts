import * as vscode from 'vscode';
import { TclDefinitionProvider } from './definitionProvider';
import { TclIndexer } from './indexer';
import { TclPreviewProvider } from './previewProvider';
import { TclCompletionProvider } from './completionProvider';
import { TclSignatureProvider } from './signatureProvider';
import { TclSemanticProvider } from './semanticProvider';
import { TclFormatter } from './formatter';

export function activate(context: vscode.ExtensionContext) {
  const indexer = new TclIndexer();
  indexer.activate(context);

  // disposables for optional features
  let defDisposable: vscode.Disposable | undefined;
  let hoverDisposable: vscode.Disposable | undefined;
  let completionDisposable: vscode.Disposable | undefined;
  let sigDisposable: vscode.Disposable | undefined;
  let semDisposable: vscode.Disposable | undefined;
  let diagnostics: vscode.DiagnosticCollection | undefined;

  const config = () => vscode.workspace.getConfiguration();

  const registerProviders = async () => {
    const cfg = config().get('tcl.features') as any || {};

    // definitions
    if (cfg.gotoDefinition !== false) {
      if (!defDisposable) {
        const defProvider = new TclDefinitionProvider(indexer);
        defDisposable = vscode.languages.registerDefinitionProvider({ language: 'tcl' }, defProvider);
        context.subscriptions.push(defDisposable);
      }
    } else if (defDisposable) { defDisposable.dispose(); defDisposable = undefined; }

    // hover
    if (cfg.hover !== false) {
      if (!hoverDisposable) {
        const hoverProvider = new TclPreviewProvider(indexer);
        hoverDisposable = vscode.languages.registerHoverProvider({ language: 'tcl' }, hoverProvider);
        context.subscriptions.push(hoverDisposable);
      }
    } else if (hoverDisposable) { hoverDisposable.dispose(); hoverDisposable = undefined; }

    // completion
    if (cfg.completion !== false) {
      if (!completionDisposable) {
        const completionProvider = new TclCompletionProvider(indexer);
        completionDisposable = vscode.languages.registerCompletionItemProvider({ language: 'tcl' }, completionProvider, '(');
        context.subscriptions.push(completionDisposable);
      }
    } else if (completionDisposable) { completionDisposable.dispose(); completionDisposable = undefined; }

    // signature help
    if (cfg.signatureHelp !== false) {
      if (!sigDisposable) {
        const signatureProvider = new TclSignatureProvider(indexer);
        sigDisposable = vscode.languages.registerSignatureHelpProvider({ language: 'tcl' }, signatureProvider, '(', ',');
        context.subscriptions.push(sigDisposable);
      }
    } else if (sigDisposable) { sigDisposable.dispose(); sigDisposable = undefined; }

    // semantic tokens
    if (cfg.semanticTokens !== false) {
      if (!semDisposable) {
        const legend = new vscode.SemanticTokensLegend(['variable', 'function', 'parameter', 'method'], []);
        const semProvider = new TclSemanticProvider(indexer);
        semDisposable = vscode.languages.registerDocumentSemanticTokensProvider({ language: 'tcl' }, semProvider, legend);
        context.subscriptions.push(semDisposable);
      }
    } else if (semDisposable) { semDisposable.dispose(); semDisposable = undefined; }

    // lint diagnostics
    if (cfg.lint !== false) {
      if (!diagnostics) {
        diagnostics = vscode.languages.createDiagnosticCollection('tcl');
        context.subscriptions.push(diagnostics);
      }
      const runLint = async () => {
        const lintResults = await indexer.lint();
        diagnostics!.clear();
        for (const r of lintResults) diagnostics!.set(r.uri, r.diagnostics);
      };
      // initial and on index updates
      runLint();
      indexer.onDidIndex(runLint, null, context.subscriptions);
    } else if (diagnostics) { diagnostics.clear(); diagnostics.dispose(); diagnostics = undefined; }
  };

  // initial registration
  registerProviders();

  // register formatter and format command
  const formatter = new TclFormatter();
  const fmtDisp = vscode.languages.registerDocumentFormattingEditProvider({ language: 'tcl' }, formatter);
  context.subscriptions.push(fmtDisp);

  const formatCmd = vscode.commands.registerCommand('tcl.formatDocument', async (resource?: vscode.Uri) => {
    try {
      if (resource && resource.fsPath) {
        // format the given file (explorer)
        const doc = await vscode.workspace.openTextDocument(resource);
        const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', doc.uri, {});
        if (edits && edits.length) {
          const we = new vscode.WorkspaceEdit();
          for (const e of edits) we.replace(doc.uri, e.range, e.newText);
          await vscode.workspace.applyEdit(we);
          await doc.save();
        }
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const doc = editor.document;
      if (doc.languageId !== 'tcl') return;
      const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', doc.uri, {});
      if (edits && edits.length) {
        const we = new vscode.WorkspaceEdit();
        for (const e of edits) we.replace(doc.uri, e.range, e.newText);
        await vscode.workspace.applyEdit(we);
        await doc.save();
      }
    } catch (e) {
      // ignore
    }
  });
  context.subscriptions.push(formatCmd);

  // add a command to rebuild the index on demand
  const rebuildCmd = vscode.commands.registerCommand('tcl.rebuildIndex', async () => {
    try { await indexer.buildIndex(); vscode.window.showInformationMessage('Tcl index rebuilt.'); } catch (e) { /*ignore*/ }
  });
  context.subscriptions.push(rebuildCmd);

  // respond to configuration changes
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('tcl.features')) registerProviders();
    if (e.affectsConfiguration('tcl.index.externalPaths')) {
      const external = vscode.workspace.getConfiguration('tcl').get<string[]>('index.externalPaths') || [];
      indexer.setExternalPaths(external, context);
    }
  }));
}

export function deactivate() {}
