import * as vscode from 'vscode';
import { classifySyntaxError, fixInsertText, fixTitle } from './syntaxQuickFixes';

export class TclSyntaxCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (!diagnostic.message) continue;

      const fixType = classifySyntaxError(diagnostic.message);
      if (fixType) {
        const action = new vscode.CodeAction(fixTitle(fixType), vscode.CodeActionKind.QuickFix);
        action.isPreferred = true;
        action.diagnostics = [diagnostic];

        const line = Math.max(0, Math.min(diagnostic.range.start.line, document.lineCount - 1));
        const insertPos = document.lineAt(line).range.end;

        action.edit = new vscode.WorkspaceEdit();
        action.edit.insert(document.uri, insertPos, fixInsertText(fixType));
        actions.push(action);
        continue;
      }

      if ((diagnostic.source ?? '').toLowerCase() === 'tcl-syntax') {
        const helpAction = new vscode.CodeAction('Show Tcl syntax troubleshooting tips', vscode.CodeActionKind.QuickFix);
        helpAction.diagnostics = [diagnostic];
        helpAction.command = {
          command: 'tcl.syntaxQuickFix.showTips',
          title: 'Show Tcl syntax troubleshooting tips'
        };
        actions.push(helpAction);
        // Suppress this specific diagnostic for the line
        const suppressLine = new vscode.CodeAction('Suppress this error (line)', vscode.CodeActionKind.QuickFix);
        suppressLine.diagnostics = [diagnostic];
        suppressLine.edit = new vscode.WorkspaceEdit();
        const line = Math.max(0, Math.min(diagnostic.range.start.line, document.lineCount - 1));
        const insertPos = document.lineAt(line).range.end;
        // Append an inline suppression comment
        suppressLine.edit.insert(document.uri, insertPos, '  # tcl-ignore');
        actions.push(suppressLine);

        // Suppress all diagnostics in this file
        const suppressFile = new vscode.CodeAction('Suppress all errors in file', vscode.CodeActionKind.QuickFix);
        suppressFile.diagnostics = [diagnostic];
        suppressFile.edit = new vscode.WorkspaceEdit();
        suppressFile.edit.insert(document.uri, new vscode.Position(0, 0), '# tcl-ignore-file\n');
        actions.push(suppressFile);
      }
    }

    return actions;
  }
}
