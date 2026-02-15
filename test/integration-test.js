#!/usr/bin/env node

// Integration test for TCL syntax checker
// This tests the actual tclsh integration on Linux

const { TclSyntaxChecker } = require('../out/syntaxChecker');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

async function mockDocument(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  
  return {
    uri: { fsPath: filePath, toString: () => `file://${filePath}` },
    fileName: filePath,
    languageId: 'tcl',
    lineCount: lines.length,
    getText: () => content,
    lineAt: (line) => ({
      text: lines[line] || '',
      range: { start: { line, character: 0 }, end: { line, character: (lines[line] || '').length } }
    })
  };
}

async function runTests() {
  console.log('Testing TCL Syntax Checker Integration\n');
  console.log('='.repeat(50));
  
  const checker = new TclSyntaxChecker();
  const fixturesDir = path.join(__dirname, '../test/fixtures/syntax-errors');
  
  // Test 1: Valid syntax
  console.log('\n1. Testing valid-syntax.tcl...');
  try {
    const doc = await mockDocument(path.join(fixturesDir, 'valid-syntax.tcl'));
    const result = await checker.checkSyntax(doc);
    
    if (result.diagnostics.length === 0) {
      console.log('   ✓ PASS: No errors detected (as expected)');
    } else {
      console.log('   ✗ FAIL: Unexpected errors:', result.diagnostics.map(d => d.message));
    }
  } catch (err) {
    console.log('   ✗ ERROR:', err.message);
  }
  
  // Test 2: Missing brace
  console.log('\n2. Testing missing-brace.tcl...');
  try {
    const doc = await mockDocument(path.join(fixturesDir, 'missing-brace.tcl'));
    const result = await checker.checkSyntax(doc);
    
    if (result.diagnostics.length > 0) {
      console.log('   ✓ PASS: Error detected');
      console.log('   Line:', result.diagnostics[0].range.start.line + 1);
      console.log('   Message:', result.diagnostics[0].message);
    } else {
      console.log('   ✗ FAIL: No errors detected (expected error)');
    }
  } catch (err) {
    console.log('   ✗ ERROR:', err.message);
  }
  
  // Test 3: Extra brace
  console.log('\n3. Testing extra-brace.tcl...');
  try {
    const doc = await mockDocument(path.join(fixturesDir, 'extra-brace.tcl'));
    const result = await checker.checkSyntax(doc);
    
    if (result.diagnostics.length > 0) {
      console.log('   ✓ PASS: Error detected');
      console.log('   Line:', result.diagnostics[0].range.start.line + 1);
      console.log('   Message:', result.diagnostics[0].message);
    } else {
      console.log('   ✗ FAIL: No errors detected (expected error)');
    }
  } catch (err) {
    console.log('   ✗ ERROR:', err.message);
  }
  
  // Test 4: Unclosed quote
  console.log('\n4. Testing unclosed-quote.tcl...');
  try {
    const doc = await mockDocument(path.join(fixturesDir, 'unclosed-quote.tcl'));
    const result = await checker.checkSyntax(doc);
    
    if (result.diagnostics.length > 0) {
      console.log('   ✓ PASS: Error detected');
      console.log('   Line:', result.diagnostics[0].range.start.line + 1);
      console.log('   Message:', result.diagnostics[0].message);
    } else {
      console.log('   ✗ FAIL: No errors detected (expected error)');
    }
  } catch (err) {
    console.log('   ✗ ERROR:', err.message);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('Integration testing complete!');
}

// Mock vscode namespace for Range and Diagnostic
global.vscode = {
  Range: class Range {
    constructor(startLine, startChar, endLine, endChar) {
      this.start = { line: startLine, character: startChar };
      this.end = { line: endLine, character: endChar };
    }
  },
  Diagnostic: class Diagnostic {
    constructor(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3
  },
  workspace: {
    getConfiguration: () => ({
      get: (key, defaultValue) => {
        if (key === 'syntaxCheckMode') return 'local';
        if (key === 'tclshPath') return 'tclsh';
        return defaultValue;
      }
    })
  }
};

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
