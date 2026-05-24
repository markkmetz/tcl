#!/usr/bin/env node

// Run TclSyntaxChecker.checkLightweightSyntax for file paths or directories
const path = require('path');
const fs = require('fs');

const outDir = path.join(__dirname, '../../out');
const checkerModulePath = path.join(outDir, 'syntaxChecker.js');
if (!fs.existsSync(checkerModulePath)) {
  console.error('Compiled module not found:', checkerModulePath);
  console.error('Run `npm run compile` first.');
  process.exit(1);
}

const { TclSyntaxChecker } = require(checkerModulePath);

function mockDocument(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  return {
    uri: { fsPath: filePath, toString: () => `file://${filePath}` },
    fileName: filePath,
    languageId: 'tcl',
    lineCount: lines.length,
    getText: () => content,
    lineAt: (line) => ({ text: lines[line] || '', range: { start: { line, character: 0 }, end: { line, character: (lines[line]||'').length } } }),
  };
}

async function runFiles(files) {
  const checker = new TclSyntaxChecker();
  const report = [];
  for (const f of files) {
    try {
      const doc = mockDocument(f);
      const res = await checker.checkLightweightSyntax(doc);
      report.push({ file: f, count: res.diagnostics.length, messages: res.diagnostics.map(d => d.message) });
    } catch (e) {
      report.push({ file: f, error: String(e) });
    }
  }
  return report;
}

function collectTclFiles(inputPath, sink) {
  const stat = fs.statSync(inputPath);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(inputPath, { withFileTypes: true });
    for (const entry of entries) {
      collectTclFiles(path.join(inputPath, entry.name), sink);
    }
    return;
  }

  if (inputPath.toLowerCase().endsWith('.tcl')) {
    sink.push(inputPath);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: run_syntax_paths.js <file_or_dir> <file_or_dir> ...');
    process.exit(2);
  }
  const files = [];
  for (const p of args) {
    const resolved = path.resolve(p);
    if (fs.existsSync(resolved)) {
      collectTclFiles(resolved, files);
    }
    else console.error('File not found:', resolved);
  }

  files.sort((a, b) => a.localeCompare(b));
  console.log(`Scanning ${files.length} Tcl file(s)`);

  const rep = await runFiles(files);
  let total = 0;
  let filesWithDiagnostics = 0;
  const messageCounts = new Map();
  for (const r of rep) {
    if (r.error) console.error(r.file, 'ERROR', r.error);
    else {
      total += r.count;
      if (r.count > 0) {
        filesWithDiagnostics += 1;
        console.log(`${r.file}: ${r.count} diagnostic(s)`);
        for (const m of r.messages.slice(0, 5)) console.log('  -', m);
        if (r.messages.length > 5) console.log('  ...');
      }

      for (const m of r.messages) {
        messageCounts.set(m, (messageCounts.get(m) || 0) + 1);
      }
    }
  }
  console.log(`Files with diagnostics: ${filesWithDiagnostics}`);
  console.log(`Total diagnostics: ${total}`);

  const topMessages = [...messageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  if (topMessages.length) {
    console.log('Top diagnostic messages:');
    for (const [msg, count] of topMessages) {
      console.log(`  ${count}x ${msg}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
