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
        // Suppress this diagnostic for the line: provide options for error/warning/all
        const levels = [
          { key: 'error', title: 'Suppress this error (line)' },
          { key: 'warning', title: 'Suppress this warning (line)' },
          { key: 'all', title: 'Suppress all diagnostics (line)' },
        ];
        for (const lvl of levels) {
          const act = new vscode.CodeAction(lvl.title, vscode.CodeActionKind.QuickFix);
          act.diagnostics = [diagnostic];
          act.edit = new vscode.WorkspaceEdit();
          const ln = Math.max(0, Math.min(diagnostic.range.start.line, document.lineCount - 1));
          const insertPos = document.lineAt(ln).range.end;
          const token = lvl.key === 'all' ? '  # tcl-ignore' : `  # tcl-ignore:${lvl.key}`;
          act.edit.insert(document.uri, insertPos, token);
          actions.push(act);
        }

        // Suppress across the file: options for error/warning/all
        const fileLevels = [
          { key: 'error', title: 'Suppress all errors in file' },
          { key: 'warning', title: 'Suppress all warnings in file' },
          { key: 'all', title: 'Suppress all diagnostics in file' },
        ];
        for (const fl of fileLevels) {
          const fAct = new vscode.CodeAction(fl.title, vscode.CodeActionKind.QuickFix);
          fAct.diagnostics = [diagnostic];
          fAct.edit = new vscode.WorkspaceEdit();
          const token = fl.key === 'all' ? '# tcl-ignore-file\n' : `# tcl-ignore-file:${fl.key}\n`;
          fAct.edit.insert(document.uri, new vscode.Position(0, 0), token);
          actions.push(fAct);
        }
      }
    }

    return actions;
  }
}
