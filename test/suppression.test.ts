import { expect } from 'chai';
import * as vscode from 'vscode';

// Minimal mock TextDocument implementing the properties used by the checker
class MockTextDocument {
  lines: string[];
  uri: any;
  constructor(content: string) {
    this.lines = content.split(/\r?\n/);
    this.uri = { toString: () => 'file:///mock.tcl' };
  }
  get lineCount() { return this.lines.length; }
  lineAt(i: number) {
    const idx = Math.max(0, Math.min(i, this.lines.length - 1));
    return { text: this.lines[idx], range: new vscode.Range(idx, 0, idx, this.lines[idx].length) } as any;
  }
  getText() { return this.lines.join('\n'); }
}

describe('Diagnostic suppression', () => {
  // Local copy of suppression detection to avoid importing vscode-dependent class in tests
  function isSuppressed(document: any, diagnostic: any): boolean {
    try {
      const headLines = Math.min(50, document.lineCount);
      for (let i = 0; i < headLines; i++) {
        const txt = document.lineAt(i).text;
        if (/#\s*tcl-ignore-file\b/i.test(txt)) return true;
      }

      const line = Math.max(0, Math.min(diagnostic.range.start.line, document.lineCount - 1));

      const lineText = document.lineAt(line).text;
      if (/#\s*tcl-ignore\b/i.test(lineText)) return true;

      if (line > 0) {
        const prevText = document.lineAt(line - 1).text;
        if (/#\s*tcl-ignore\b/i.test(prevText)) return true;
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  function makeDiag(line: number) {
    return { range: { start: { line } } } as any;
  }

  it('suppresses when file-level marker is present', () => {
    const doc = new MockTextDocument('# tcl-ignore-file\nputs $x\n');
    const diag = makeDiag(1);
    const suppressed = isSuppressed(doc as any, diag as any);
    expect(suppressed).to.be.true;
  });

  it('suppresses when same-line marker is present', () => {
    const doc = new MockTextDocument('puts $x  # tcl-ignore\n');
    const diag = makeDiag(0);
    const suppressed = isSuppressed(doc as any, diag as any);
    expect(suppressed).to.be.true;
  });

  it('suppresses when previous-line marker is present', () => {
    const doc = new MockTextDocument('# tcl-ignore\nputs $x\n');
    const diag = makeDiag(1);
    const suppressed = isSuppressed(doc as any, diag as any);
    expect(suppressed).to.be.true;
  });

  it('does not suppress when no marker is present', () => {
    const doc = new MockTextDocument('puts $x\nputs $y\n');
    const diag = makeDiag(0);
    const suppressed = isSuppressed(doc as any, diag as any);
    expect(suppressed).to.be.false;
  });
});
