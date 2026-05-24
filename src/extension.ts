import * as vscode from 'vscode';
import { TclDefinitionProvider } from './definitionProvider';
import { TclIndexer } from './indexer';
import { TclPreviewProvider } from './previewProvider';
import { TclCompletionProvider } from './completionProvider';
import { TclSignatureProvider } from './signatureProvider';
import { TclSemanticProvider } from './semanticProvider';
import { TclFormatter } from './formatter';
import { TclSyntaxChecker, SyntaxCheckStatus } from './syntaxChecker';
import { TclSyntaxCodeActionProvider } from './syntaxCodeActionProvider';
import { TclCodeLensProvider } from './codeLensProvider';
import { TclReferenceProvider } from './referenceProvider';
import { TclIndexerStatus } from './indexer';

export function activate(context: vscode.ExtensionContext) {
  const indexer = new TclIndexer();

  const indexerLogChannel = vscode.window.createOutputChannel('Tcl Indexer');
  context.subscriptions.push(indexerLogChannel);

  const indexerStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  indexerStatusBar.command = 'tcl.showIndexerLog';
  indexerStatusBar.tooltip = 'Show Tcl indexer log';
  indexerStatusBar.text = '$(database) Tcl Index: idle';
  indexerStatusBar.show();
  context.subscriptions.push(indexerStatusBar);

  const showIndexerLogCmd = vscode.commands.registerCommand('tcl.showIndexerLog', () => {
    indexerLogChannel.show(true);
  });
  context.subscriptions.push(showIndexerLogCmd);

  const renderIndexerStatus = (status: TclIndexerStatus) => {
    if (status.state === 'indexing') {
      const progress = status.filesTotal
        ? ` (${status.filesProcessed || 0}/${status.filesTotal})`
        : '';
      indexerStatusBar.text = `$(sync~spin) Tcl Index${progress}`;
      return;
    }

    if (status.state === 'error') {
      indexerStatusBar.text = `$(error) Tcl Index: ${status.message}`;
      return;
    }

    const duration = typeof status.durationMs === 'number' ? ` in ${status.durationMs}ms` : '';
    indexerStatusBar.text = `$(database) Tcl Index: ready${duration}`;
  };

  indexer.onDidLog(msg => indexerLogChannel.appendLine(msg), null, context.subscriptions);
  indexer.onDidStatus(renderIndexerStatus, null, context.subscriptions);

  indexer.activate(context);

  // Syntax checker status bar
  const syntaxStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 89);
  syntaxStatusBar.tooltip = 'Syntax check status';
  syntaxStatusBar.text = '$(check) Syntax: idle';
  syntaxStatusBar.show();
  context.subscriptions.push(syntaxStatusBar);

  // disposables for optional features
  let defDisposable: vscode.Disposable | undefined;
  let hoverDisposable: vscode.Disposable | undefined;
  let completionDisposable: vscode.Disposable | undefined;
  let sigDisposable: vscode.Disposable | undefined;
  let semDisposable: vscode.Disposable | undefined;
  let codeLensDisposable: vscode.Disposable | undefined;
  let refDisposable: vscode.Disposable | undefined;
  let syntaxCodeActionDisposable: vscode.Disposable | undefined;
  let syntaxDiagnostics: vscode.DiagnosticCollection | undefined;

  // syntax checker
  const syntaxChecker = new TclSyntaxChecker(indexer, indexerLogChannel);

  const renderSyntaxStatus = (status: SyntaxCheckStatus) => {
    if (status.state === 'checking') {
      syntaxStatusBar.text = `$(sync~spin) Syntax: checking ${status.fileName || ''}`;
      return;
    }

    if (status.state === 'complete') {
      if (status.errorCount === 0) {
        syntaxStatusBar.text = `$(check) Syntax: OK`;
      } else {
        syntaxStatusBar.text = `$(error) Syntax: ${status.errorCount} error${status.errorCount !== 1 ? 's' : ''}`;
      }
      return;
    }

    syntaxStatusBar.text = '$(check) Syntax: idle';
  };

  syntaxChecker.onDidStatus(renderSyntaxStatus, null, context.subscriptions);

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
        const completionProvider = new TclCompletionProvider(indexer, cfg.snippets !== false);
        completionDisposable = vscode.languages.registerCompletionItemProvider({ language: 'tcl' }, completionProvider, '(', ' ', '$');
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
    if (cfg.semanticTokens === true) {
      if (!semDisposable) {
        const legend = new vscode.SemanticTokensLegend(['variable', 'function', 'parameter', 'method', 'keyword', 'namespace', 'dictKey', 'dictValue', 'dictCommand', 'dictSubcommand'], []);
        const semProvider = new TclSemanticProvider(indexer);
        semDisposable = vscode.languages.registerDocumentSemanticTokensProvider({ language: 'tcl' }, semProvider, legend);
        context.subscriptions.push(semDisposable);
      }
    } else if (semDisposable) { semDisposable.dispose(); semDisposable = undefined; }

    // references
    if (cfg.gotoDefinition !== false) {
      if (!refDisposable) {
        const referenceProvider = new TclReferenceProvider(indexer);
        refDisposable = vscode.languages.registerReferenceProvider({ language: 'tcl' }, referenceProvider);
        context.subscriptions.push(refDisposable);
      }
    } else if (refDisposable) { refDisposable.dispose(); refDisposable = undefined; }

    // code lens usage counts
    if (cfg.codeLens !== false) {
      if (!codeLensDisposable) {
        const codeLensProvider = new TclCodeLensProvider(indexer);
        codeLensDisposable = vscode.languages.registerCodeLensProvider({ language: 'tcl' }, codeLensProvider);
        context.subscriptions.push(codeLensDisposable);
      }
    } else if (codeLensDisposable) { codeLensDisposable.dispose(); codeLensDisposable = undefined; }
  };

  // syntax checking with tclsh
  const setupSyntaxChecking = () => {
    const mode = config().get<string>('tcl.runtime.syntaxCheckMode', 'lightweight');
    
    if (!syntaxDiagnostics) {
      syntaxDiagnostics = vscode.languages.createDiagnosticCollection('tcl-syntax');
      context.subscriptions.push(syntaxDiagnostics);
    }

    if (!syntaxCodeActionDisposable) {
      syntaxCodeActionDisposable = vscode.languages.registerCodeActionsProvider(
        { language: 'tcl' },
        new TclSyntaxCodeActionProvider(),
        { providedCodeActionKinds: TclSyntaxCodeActionProvider.providedCodeActionKinds }
      );
      context.subscriptions.push(syntaxCodeActionDisposable);
    }

    // Warn once that local tclsh execution is not sandboxed.
    // Future releases will use a safe Tcl-script-based checker instead.
    if (mode === 'local') {
      const warningKey = 'tcl.syntaxSafetyWarningShown';
      if (!context.globalState.get<boolean>(warningKey)) {
        context.globalState.update(warningKey, true);
        vscode.window.showWarningMessage(
          'Tcl syntax checking runs your workspace files through a local tclsh process, ' +
          'which is not sandboxed. Avoid opening untrusted Tcl projects with this feature enabled. '
          + 'A safer script-based checker is planned for a future release.',
          'OK'
        );
      }
    }

    const useLightweight = mode === 'lightweight';

    const checkAllDocuments = () => {
      vscode.workspace.textDocuments.forEach(doc => {
        if (doc.languageId !== 'tcl') return;
        if (useLightweight) {
          syntaxChecker.scheduleLightweightCheck(doc, syntaxDiagnostics!, true);
        } else {
          syntaxChecker.scheduleCheck(doc, syntaxDiagnostics!, true);
        }
      });
    };

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.languageId !== 'tcl') return;
        if (useLightweight) {
          syntaxChecker.scheduleLightweightCheck(event.document, syntaxDiagnostics!);
        } else {
          syntaxChecker.scheduleCheck(event.document, syntaxDiagnostics!, false);
        }
      })
    );

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(doc => {
        if (doc.languageId !== 'tcl') return;
        if (useLightweight) {
          syntaxChecker.scheduleLightweightCheck(doc, syntaxDiagnostics!, true);
        } else {
          syntaxChecker.scheduleCheck(doc, syntaxDiagnostics!, true);
        }
      })
    );

    // When a document is opened, run the appropriate syntax check immediately
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.languageId !== 'tcl') return;
        // Always run the lightweight parser immediately on open
        syntaxChecker.scheduleLightweightCheck(doc, syntaxDiagnostics!, true);
        // If configured mode is not lightweight, also run the configured check
        if (!useLightweight) {
          syntaxChecker.scheduleCheck(doc, syntaxDiagnostics!, true);
        }
      })
    );

    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument(doc => {
        if (doc.languageId === 'tcl') {
          syntaxDiagnostics!.delete(doc.uri);
        }
      })
    );

    checkAllDocuments();
  };

  // initial registration
  registerProviders();
  setupSyntaxChecking();

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

  const syntaxTipsCmd = vscode.commands.registerCommand('tcl.syntaxQuickFix.showTips', () => {
    vscode.window.showInformationMessage(
      'Tcl syntax tips: check matching {}, [], and quotes ("), then re-run syntax check by saving the file.'
    );
  });
  context.subscriptions.push(syntaxTipsCmd);

  // respond to configuration changes
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('tcl.features')) registerProviders();
    if (e.affectsConfiguration('tcl.runtime')) setupSyntaxChecking();
    if (e.affectsConfiguration('tcl.index.externalPaths')) {
      const external = vscode.workspace.getConfiguration('tcl').get<string[]>('index.externalPaths') || [];
      indexer.setExternalPaths(external, context);
    }
  }));
}

export function deactivate() {}
