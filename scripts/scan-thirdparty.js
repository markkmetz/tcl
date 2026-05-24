#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const targetDir = '/home/markkmetz/Documents/test/third_party/';

function findTclFiles(dir) {
  const results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of list) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      results.push(...findTclFiles(full));
    } else if (ent.isFile() && full.endsWith('.tcl')) {
      results.push(full);
    }
  }
  return results;
}

// Minimal vscode mock similar to integration-test
global.vscode = {
  Range: class Range {
    constructor(sLine, sChar, eLine, eChar) {
      this.start = { line: sLine, character: sChar };
      this.end = { line: eLine, character: eChar };
    }
  },
  Diagnostic: class Diagnostic {
    constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; }
  },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  workspace: {
    getConfiguration: () => ({ get: (k, d) => {
      if (k === 'tcl.runtime.syntaxCheckMode') return 'lightweight';
      if (k === 'tcl.runtime.syntaxCheckDelay') return 10;
      return d;
    }}),
  },
};

const utils = require('../out/syntaxCheckerUtils');
const checkerInstance = {
  checkLightweight: async (doc) => ({ uri: doc.uri, diagnostics: utils.collectLightweightSyntaxIssues(doc.getText().split(/\r?\n/)).map(issue => ({ range: { start: { line: issue.line, character: 0 }, end: { line: issue.line, character: 0 } }, message: issue.message, severity: issue.severity } )) })
};

const files = findTclFiles(targetDir);
if (!files.length) {
  console.log('No .tcl files found in', targetDir);
  process.exit(0);
}

(async () => {
  for (let pass = 1; pass <= 2; pass++) {
    console.log(`\nPass ${pass}: scanning ${files.length} file(s)...`);
    const counts = [];
    for (const f of files) {
      try {
        const content = fs.readFileSync(f, 'utf8');
        const lines = content.split(/\r?\n/);
        const doc = {
          uri: { fsPath: f, toString: () => `file://${f}` },
          fileName: f,
          languageId: 'tcl',
          lineCount: lines.length,
          getText: () => content,
          lineAt: (line) => ({ text: lines[line] || '', range: { start: { line, character: 0 }, end: { line, character: (lines[line] || '').length } } })
        };
        // use lightweight collector directly
        const issues = utils.collectLightweightSyntaxIssues(lines);
        counts.push({ file: f, diagnostics: issues.length });
        console.log(`${path.relative(targetDir, f)} -> ${issues.length}`);
      } catch (e) {
        console.error('ERR reading', f, e && e.message);
      }
    }
    const total = counts.reduce((s, c) => s + c.diagnostics, 0);
    console.log(`Total diagnostics: ${total}`);
  }
})();
