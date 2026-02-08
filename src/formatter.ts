import * as vscode from 'vscode';

export class TclFormatter implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
    const lines = document.getText().split(/\r?\n/);
    let indentLevel = 0;
    const indentUnit = '  ';
    const out: string[] = [];

    for (let raw of lines) {
      let line = raw.trim();
      if (line.length === 0) { out.push(''); continue; }

      // decrease indent if line starts with a closing brace
      if (line.startsWith('}')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      const indent = indentUnit.repeat(indentLevel);
      // normalize spaces around keywords a bit
      // ensure single space after 'proc' or 'method' and before argument list
      line = line.replace(/^\s*(proc|method)\s+/, (m, p1) => `${p1} `);

      out.push(indent + line);

      // increase indent if line contains an opening brace at the end or 'namespace eval NAME {'
      if (/{\s*$/.test(line) || /namespace\s+eval\s+[A-Za-z0-9_:]+\s*\{\s*$/.test(raw)) {
        indentLevel++;
      }
    }

    const newText = out.join('\n');
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    return [vscode.TextEdit.replace(fullRange, newText)];
  }
}
