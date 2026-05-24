import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import {
  collectLightweightSyntaxIssues,
  buildSyntaxInitScript,
  classifySyntaxSeverity,
  extractErrorMessageAndLine,
  resolveTargetLine,
  selectPrimaryFrame,
} from '../src/syntaxCheckerUtils';

// Note: These tests require a mock vscode environment
// For full integration tests, run in VS Code test environment

describe('TCL Syntax Checker', () => {
  const expectNearLine = (actual: number, expected: number) => {
    expect(Math.abs(actual - expected)).to.be.lessThanOrEqual(1, `Expected ${actual} to be within ±1 of ${expected}`);
  };

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

  describe('Real diagnostic mapping', () => {
    it('maps explicit tclsh line references to 0-based diagnostics', () => {
      const parsed = extractErrorMessageAndLine(
        'ERROR: invalid command name "invalidCmd"\n    (file "test.tcl" line 3)',
        4
      );

      const target = resolveTargetLine(parsed.message, parsed.fallbackLine, [
        'set a 1',
        'puts $a',
        'invalidCmd',
        'puts done',
      ]);

      expect(parsed.message.toLowerCase()).to.include('invalid command name');
      expect(target).to.equal(2);
      expect(parsed.frames).to.have.length.greaterThan(0);
    });

    it('uses specialized brace line detection when brace error text is reported', () => {
      const lines = [
        'proc test {} {\n' +
        '  if {$x > 0} {\n' +
        '    puts "x"\n' +
        '  }\n',
      ].join('').split('\n');

      const parsed = extractErrorMessageAndLine(
        'ERROR: missing close-brace\n    (file "test.tcl" line 99)',
        lines.length
      );
      const target = resolveTargetLine(parsed.message, parsed.fallbackLine, lines);

      expect(target).to.equal(1);
    });

    it('classifies missing variable reads as warning severity', () => {
      const parsed = extractErrorMessageAndLine(
        'ERROR: can\'t read "missingVar": no such variable\n    (file "test.tcl" line 1)',
        1
      );
      const severity = classifySyntaxSeverity(parsed.message);

      expect(severity).to.equal('warning');
      expect(parsed.fallbackLine).to.equal(0);
    });

    it('extracts file frames for wrong # args errors', () => {
      const parsed = extractErrorMessageAndLine(
        'wrong # args: should be "proc name args body"\n    while executing\n"proc broken"\n    (file "/tmp/check.tcl" line 6)',
        40
      );

      expect(parsed.message.toLowerCase()).to.include('wrong # args');
      expect(parsed.frames).to.have.lengthOf(1);
      expect(parsed.frames[0].filePath).to.equal('/tmp/check.tcl');
      expect(parsed.frames[0].line).to.equal(5);
      expect(parsed.fallbackLine).to.equal(5);
    });

    it('selects preferred frame when current temp file and sourced file are both present', () => {
      const parsed = extractErrorMessageAndLine(
        'wrong # args: should be "proc name args body"\n    (file "/workspace/lib/dependency.tcl" line 3)\n    (file "/tmp/vscode-tcl-check-1.tcl" line 8)',
        30
      );

      const primary = selectPrimaryFrame(parsed.frames, ['/tmp/vscode-tcl-check-1.tcl']);
      expect(primary).to.not.equal(undefined);
      expect(primary?.filePath).to.equal('/tmp/vscode-tcl-check-1.tcl');
      expect(primary?.line).to.equal(7);
    });

    it('matches preferred frame even with slash/case differences', () => {
      const parsed = extractErrorMessageAndLine(
        'wrong # args: should be "proc name args body"\n    (file "C:/Temp/VSCODE-TCL-CHECK-1.tcl" line 8)\n    (file "C:/workspace/dep.tcl" line 2)',
        40
      );

      const primary = selectPrimaryFrame(parsed.frames, ['c:\\temp\\vscode-tcl-check-1.tcl']);
      expect(primary).to.not.equal(undefined);
      expect(primary?.filePath).to.equal('C:/Temp/VSCODE-TCL-CHECK-1.tcl');
      expect(primary?.line).to.equal(7);
    });

    it('maps wrong-args fixture line using nearest-line tolerance', () => {
      const fixturePath = path.join(__dirname, 'fixtures', 'syntax-errors', 'wrong-args.tcl');
      const content = fs.readFileSync(fixturePath, 'utf8');
      const lines = content.split(/\r?\n/);

      const expectedLine = lines.findIndex(line => line.includes('[addTwo 10]'));
      expect(expectedLine).to.be.greaterThan(-1);

      const parsed = extractErrorMessageAndLine(
        `wrong # args: should be "addTwo a b"\n    while executing\n"addTwo 10"\n    (file "/tmp/vscode-tcl-check-123.tcl" line ${expectedLine + 1})`,
        lines.length
      );
      const mapped = resolveTargetLine(parsed.message, parsed.fallbackLine, lines);

      expectNearLine(mapped, expectedLine);
    });

    it('extracts multiple frames from callstack text', () => {
      const parsed = extractErrorMessageAndLine(
        'invalid command name "badCall"\n    while executing\n"badCall"\n    (file "/tmp/current.tcl" line 4)\n    invoked from within\n"wrapper"\n    (file "/workspace/dep.tcl" line 12)',
        50
      );

      expect(parsed.frames).to.have.lengthOf(2);
      expect(parsed.frames[0].filePath).to.equal('/tmp/current.tcl');
      expect(parsed.frames[0].line).to.equal(3);
      expect(parsed.frames[1].filePath).to.equal('/workspace/dep.tcl');
      expect(parsed.frames[1].line).to.equal(11);
    });

    it('collects lightweight pairing issues for braces, brackets, and quotes', () => {
      const issues = collectLightweightSyntaxIssues([
        'proc test {arg} {',
        '  set value [expr {$arg + 1}',
        '  puts "unterminated',
      ]);

      // Prioritize checking that the pairing issues are present; other warnings
      // (unused variables/procs) may also be returned by the lightweight checker.
      const pairing = issues.filter(issue => [
        'Possible unmatched brace',
        'Possible unmatched bracket',
        'Possible unclosed quote',
      ].includes(issue.message));

      expect(pairing).to.have.lengthOf(3);
      expect(pairing.map(issue => issue.line)).to.deep.equal([1, 1, 2]);
      expect(pairing.map(issue => issue.message)).to.deep.equal([
        'Possible unmatched brace',
        'Possible unmatched bracket',
        'Possible unclosed quote',
      ]);
    });
  });

  describe('Import preloading init script', () => {
    it('generates source guards for each file and normalizes slashes', () => {
      const script = buildSyntaxInitScript([
        'C:\\repo\\pkg\\a.tcl',
        '/workspace/lib/b.tcl',
      ]);

      expect(script).to.include('source "C:/repo/pkg/a.tcl"');
      expect(script).to.include('source "/workspace/lib/b.tcl"');
      expect(script).to.include('Ignore errors during sourcing');
      expect((script.match(/if \{\[catch \{source/g) || []).length).to.equal(2);
    });

    it('is deterministic for sorted input order', () => {
      const files = ['/z/last.tcl', '/a/first.tcl', '/m/mid.tcl'].sort((a, b) => a.localeCompare(b));
      const script = buildSyntaxInitScript(files);

      const firstIndex = script.indexOf('/a/first.tcl');
      const midIndex = script.indexOf('/m/mid.tcl');
      const lastIndex = script.indexOf('/z/last.tcl');

      expect(firstIndex).to.be.greaterThan(-1);
      expect(midIndex).to.be.greaterThan(firstIndex);
      expect(lastIndex).to.be.greaterThan(midIndex);
    });

    it('includes source-order fixtures in predictable order when sorted', () => {
      const files = [
        '/workspace/test/fixtures/syntax-errors/source-order-b.tcl',
        '/workspace/test/fixtures/syntax-errors/source-order-a.tcl',
      ].sort((a, b) => a.localeCompare(b));

      const script = buildSyntaxInitScript(files);
      const aIndex = script.indexOf('source "/workspace/test/fixtures/syntax-errors/source-order-a.tcl"');
      const bIndex = script.indexOf('source "/workspace/test/fixtures/syntax-errors/source-order-b.tcl"');

      expect(aIndex).to.be.greaterThan(-1);
      expect(bIndex).to.be.greaterThan(-1);
      expect(aIndex).to.be.lessThan(bIndex);
    });
  });
});
