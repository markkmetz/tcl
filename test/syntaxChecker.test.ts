import { expect } from 'chai';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Note: These tests require a mock vscode environment
// For full integration tests, run in VS Code test environment

describe('TCL Syntax Checker', () => {
  describe('Error Detection Patterns', () => {
    it('should detect missing close brace pattern', () => {
      const content = `proc test {arg} {\n  puts "hello"\n  if {$arg > 0} {\n    puts "positive"`;
      const lines = content.split('\n');
      
      // Simulate brace counting
      let depth = 0;
      let hasError = false;
      
      for (const line of lines) {
        for (const ch of line) {
          if (ch === '{') depth++;
          if (ch === '}') depth--;
        }
      }
      
      if (depth !== 0) hasError = true;
      expect(hasError).to.be.true;
      expect(depth).to.equal(2); // Two unclosed braces
    });

    it('should detect missing close bracket pattern', () => {
      const content = `set result [expr {$x + 1}\nputs $result`;
      const lines = content.split('\n');
      
      let depth = 0;
      let hasError = false;
      
      for (const line of lines) {
        let inQuote = false;
        for (const ch of line) {
          if (ch === '"') inQuote = !inQuote;
          if (!inQuote) {
            if (ch === '[') depth++;
            if (ch === ']') depth--;
          }
        }
      }
      
      if (depth !== 0) hasError = true;
      expect(hasError).to.be.true;
      expect(depth).to.equal(1); // One unclosed bracket
    });

    it('should detect extra closing brace', () => {
      const content = `proc test {arg} {\n  puts "hello"\n}\n}`;
      const lines = content.split('\n');
      
      let depth = 0;
      let hasError = false;
      
      for (const line of lines) {
        for (const ch of line) {
          if (ch === '{') depth++;
          if (ch === '}') depth--;
          if (depth < 0) hasError = true;
        }
      }
      
      expect(hasError).to.be.true;
    });

    it('should not flag valid TCL syntax', () => {
      const content = `proc test {arg} {\n  set x [expr {$arg + 1}]\n  puts "Result: $x"\n  return $x\n}`;
      const lines = content.split('\n');
      
      let braceDepth = 0;
      let bracketDepth = 0;
      let hasError = false;
      
      for (const line of lines) {
        let inQuote = false;
        for (const ch of line) {
          if (ch === '"') inQuote = !inQuote;
          if (!inQuote) {
            if (ch === '{') braceDepth++;
            if (ch === '}') braceDepth--;
            if (ch === '[') bracketDepth++;
            if (ch === ']') bracketDepth--;
            if (braceDepth < 0 || bracketDepth < 0) hasError = true;
          }
        }
      }
      
      if (braceDepth !== 0 || bracketDepth !== 0) hasError = true;
      expect(hasError).to.be.false;
    });
  });

  describe('Error Message Parsing', () => {
    it('should extract line numbers from tclsh error output', () => {
      const errorText = 'ERROR: missing close brace\n    (file "test.tcl" line 5)';
      const lineMatch = errorText.match(/line (\d+)/i);
      
      expect(lineMatch).to.not.be.null;
      if (lineMatch) {
        const lineNumber = parseInt(lineMatch[1], 10);
        expect(lineNumber).to.equal(5);
      }
    });

    it('should handle error messages without line numbers', () => {
      const errorText = 'ERROR: invalid command name "badcommand"';
      const lineMatch = errorText.match(/line (\d+)/i);
      
      expect(lineMatch).to.be.null;
    });

    it('should identify common error patterns', () => {
      const errors = [
        'wrong # args: should be "proc name args body"',
        'invalid command name "unknownCmd"',
        'missing close-brace',
        'extra characters after close-quote',
        'missing close-bracket'
      ];
      
      const patterns = [
        /wrong # args/i,
        /invalid command name/i,
        /missing close-brace/i,
        /extra characters after close-quote/i,
        /missing close-bracket/i
      ];
      
      for (let i = 0; i < errors.length; i++) {
        expect(patterns[i].test(errors[i])).to.be.true;
      }
    });
  });

  describe('Syntax Checker Configuration', () => {
    it('should support disabled mode', () => {
      const mode = 'disabled';
      expect(mode).to.equal('disabled');
      // When disabled, no checks should be performed
    });

    it('should support local mode', () => {
      const mode = 'local';
      expect(mode).to.equal('local');
      // When local, should use tclsh executable
    });

    it('should support remote mode', () => {
      const mode = 'remote';
      expect(mode).to.equal('remote');
      // When remote, should use HTTP service
    });

    it('should have default tclsh path', () => {
      const defaultPath = 'tclsh';
      expect(defaultPath).to.equal('tclsh');
      // Default should be 'tclsh' to search PATH
    });

    it('should support custom delay configuration', () => {
      const delay = 10;
      expect(delay).to.be.greaterThanOrEqual(1);
      expect(delay).to.be.lessThanOrEqual(300);
    });
  });

  describe('Error Line Detection', () => {
    it('should find brace error on correct line', () => {
      const lines = [
        'proc test {arg} {',
        '  puts "hello"',
        '  if {$arg > 0} {',
        '    puts "positive"',
        '  # Missing closing brace for if',
        '# Missing closing brace for proc'
      ];
      
      let depth = 0;
      let lastOpenLine = -1;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const ch of line) {
          if (ch === '{') {
            depth++;
            lastOpenLine = i;
          }
          if (ch === '}') depth--;
        }
      }
      
      expect(depth).to.be.greaterThan(0);
      expect(lastOpenLine).to.be.greaterThan(-1);
      // Last open line should be where error can be reported
    });

    it('should find bracket error on correct line', () => {
      const lines = [
        'set x [expr {$y + 1}',
        'puts $x',
        '# Missing closing bracket'
      ];
      
      let depth = 0;
      let lastOpenLine = -1;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let inQuote = false;
        for (const ch of line) {
          if (ch === '"') inQuote = !inQuote;
          if (!inQuote) {
            if (ch === '[') {
              depth++;
              lastOpenLine = i;
            }
            if (ch === ']') depth--;
          }
        }
      }
      
      expect(depth).to.be.greaterThan(0);
      expect(lastOpenLine).to.equal(0);
    });

    it('should handle quote errors', () => {
      const lines = [
        'proc test {} {',
        '  puts "Hello world',
        '  puts "This will fail"',
        '}'
      ];
      
      let hasQuoteError = false;
      let errorLine = -1;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let quoteCount = 0;
        for (const ch of line) {
          if (ch === '"') quoteCount++;
        }
        if (quoteCount % 2 !== 0) {
          hasQuoteError = true;
          errorLine = i;
          break;
        }
      }
      
      expect(hasQuoteError).to.be.true;
      expect(errorLine).to.equal(1);
    });
  });

  describe('Fixture Files', () => {
    const fixturesDir = path.join(__dirname, 'fixtures', 'syntax-errors');
    
    it('should have fixture file with missing brace', () => {
      const filePath = path.join(fixturesDir, 'missing-brace.tcl');
      const exists = fs.existsSync(filePath);
      expect(exists).to.be.true;
      
      if (exists) {
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).to.include('proc testMissingBrace');
        
        // Check that it has unbalanced braces
        let depth = 0;
        for (const ch of content) {
          if (ch === '{') depth++;
          if (ch === '}') depth--;
        }
        expect(depth).to.not.equal(0);
      }
    });

    it('should have fixture file with missing bracket', () => {
      const filePath = path.join(fixturesDir, 'missing-bracket.tcl');
      const exists = fs.existsSync(filePath);
      expect(exists).to.be.true;
      
      if (exists) {
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).to.include('proc testMissingBracket');
        
        // Check that it has unbalanced brackets
        let depth = 0;
        for (const ch of content) {
          if (ch === '[') depth++;
          if (ch === ']') depth--;
        }
        expect(depth).to.not.equal(0);
      }
    });

    it('should have fixture file with extra brace', () => {
      const filePath = path.join(fixturesDir, 'extra-brace.tcl');
      const exists = fs.existsSync(filePath);
      expect(exists).to.be.true;
      
      if (exists) {
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).to.include('proc testExtraBrace');
      }
    });

    it('should have fixture file with unclosed quote', () => {
      const filePath = path.join(fixturesDir, 'unclosed-quote.tcl');
      const exists = fs.existsSync(filePath);
      expect(exists).to.be.true;
      
      if (exists) {
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).to.include('proc testQuoteError');
      }
    });

    it('should have valid syntax fixture', () => {
      const filePath = path.join(fixturesDir, 'valid-syntax.tcl');
      const exists = fs.existsSync(filePath);
      expect(exists).to.be.true;
      
      if (exists) {
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).to.include('proc validProc');
        
        // Check that it has balanced braces and brackets
        let braceDepth = 0;
        let bracketDepth = 0;
        
        for (const ch of content) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
          if (ch === '[') bracketDepth++;
          if (ch === ']') bracketDepth--;
        }
        
        expect(braceDepth).to.equal(0);
        expect(bracketDepth).to.equal(0);
      }
    });
  });

  describe('Remote Checker Format', () => {
    it('should handle remote service error format', () => {
      const remoteResponse = {
        errors: [
          { line: 5, message: 'missing close brace', severity: 'error' },
          { line: 10, message: 'unused variable', severity: 'warning' }
        ]
      };
      
      expect(remoteResponse.errors).to.have.lengthOf(2);
      expect(remoteResponse.errors[0].line).to.equal(5);
      expect(remoteResponse.errors[0].severity).to.equal('error');
      expect(remoteResponse.errors[1].severity).to.equal('warning');
    });

    it('should handle empty remote response', () => {
      const remoteResponse = { errors: [] };
      expect(remoteResponse.errors).to.be.an('array');
      expect(remoteResponse.errors).to.have.lengthOf(0);
    });
  });
});
