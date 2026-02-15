#!/usr/bin/env node

// Simple tclsh integration test
// Tests that tclsh can be executed and returns proper error messages

const child_process = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Testing TCL tclsh Integration on Linux\n');
console.log('='.repeat(60));

const fixturesDir = path.join(__dirname, '../test/fixtures/syntax-errors');

function testFile(filename, shouldHaveError) {
  return new Promise((resolve) => {
    const filePath = path.join(fixturesDir, filename);
    
    console.log(`\nTesting: ${filename}`);
    console.log('Expected:', shouldHaveError ? 'ERROR' : 'SUCCESS');
    
    // Run tclsh with the file path directly
    const proc = child_process.spawn('tclsh', [filePath], {
      timeout: 5000
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('error', (err) => {
      console.log('✗ FAIL: Could not run tclsh:', err.message);
      resolve(false);
    });
    
    proc.on('close', (code) => {
      const hasError = code !== 0;
      const passed = hasError === shouldHaveError;
      
      if (passed) {
        console.log(`✓ PASS: Exit code ${code} (as expected)`);
        
        if (hasError && stderr) {
          // Parse error message to show line number
          const lineMatch = stderr.match(/line (\d+)/i);
          if (lineMatch) {
            console.log(`  Error on line: ${lineMatch[1]}`);
          }
          const errorLines = stderr.split('\n');
          const mainError = errorLines.find(l => 
            l.includes('missing') || l.includes('extra') || l.includes('unmatched')
          );
          if (mainError) {
            console.log(`  Error type: ${mainError.trim()}`);
          }
        }
      } else {
        console.log(`✗ FAIL: Exit code ${code} (expected ${shouldHaveError ? 'error' : 'success'})`);
        if (stderr) {
          console.log('  stderr:', stderr.substring(0, 200));
        }
      }
      
      resolve(passed);
    });
  });
}

async function runTests() {
  const tests = [
    { file: 'valid-syntax.tcl', shouldError: false },
    { file: 'missing-brace.tcl', shouldError: true },
    { file: 'extra-brace.tcl', shouldError: true },
    { file: 'unclosed-quote.tcl', shouldError: true },
    { file: 'missing-bracket.tcl', shouldError: true }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = await testFile(test.file, test.shouldError);
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${tests.length} tests`);
  
  if (failed === 0) {
    console.log('✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('✗ Some tests failed');
    process.exit(1);
  }
}

// Check if tclsh is available
child_process.exec('which tclsh', (err, stdout) => {
  if (err) {
    console.log('✗ tclsh not found in PATH');
    console.log('Install tclsh: sudo apt-get install tcl');
    process.exit(1);
  }
  
  console.log(`tclsh found at: ${stdout.trim()}`);
  runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
});
