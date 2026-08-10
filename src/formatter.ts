import * as vscode from 'vscode';
import { formatTclText } from './tclFormatterCore';

export interface TclFormatterSettings {
  insertSpaces: boolean;
  tabSize: number;
  lineEnding: string;
}

export function resolveTclFormatterSettings(
  document: vscode.TextDocument,
  formattingOptions?: Pick<vscode.FormattingOptions, 'insertSpaces' | 'tabSize'>,
): TclFormatterSettings {
  const editorConfig = vscode.workspace.getConfiguration('editor', document.uri);
  const insertSpaces = typeof formattingOptions?.insertSpaces === 'boolean'
    ? formattingOptions.insertSpaces
    : editorConfig.get<boolean>('insertSpaces', true);
  const tabSize = typeof formattingOptions?.tabSize === 'number'
    ? formattingOptions.tabSize
    : editorConfig.get<number>('tabSize', 2);

  return {
    insertSpaces,
    tabSize,
    lineEnding: document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
  };
}

export function formatTclDocumentText(
  document: vscode.TextDocument,
  formattingOptions?: Pick<vscode.FormattingOptions, 'insertSpaces' | 'tabSize'>,
): { text: string; error?: string } {
  const settings = resolveTclFormatterSettings(document, formattingOptions);
  const result = formatTclText(document.getText(), settings);

  if (result.error) {
    return { text: document.getText(), error: result.error.message };
  }

  return { text: result.formattedText };
}

export class TclFormatter implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    formattingOptions: vscode.FormattingOptions,
  ): vscode.TextEdit[] {
    const result = formatTclDocumentText(document, formattingOptions);
    if (result.error) {
      void vscode.window.showErrorMessage(result.error);
      return [];
    }

    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    return [vscode.TextEdit.replace(fullRange, result.text)];
  }
}
