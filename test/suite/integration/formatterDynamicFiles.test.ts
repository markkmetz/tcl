import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ensureExtensionActive, sleep } from './helpers';

interface FormatterCase {
  name: string;
  input: string;
  expected: string;
}

function visualizeWhitespace(text: string): string {
  return text.replace(/ /g, '·').replace(/\t/g, '⇥');
}

function formatDiff(expected: string, actual: string): string {
  const expectedLines = expected.split(/\r?\n/);
  const actualLines = actual.split(/\r?\n/);
  const max = Math.max(expectedLines.length, actualLines.length);
  const diff: string[] = [];

  for (let i = 0; i < max; i++) {
    const e = expectedLines[i] ?? '<missing>';
    const a = actualLines[i] ?? '<missing>';
    if (e !== a) {
      diff.push(`line ${i + 1}`);
      diff.push(`  expected: ${visualizeWhitespace(e)}`);
      diff.push(`  actual  : ${visualizeWhitespace(a)}`);
    }
  }

  return diff.join('\n');
}

function writeDebugArtifacts(filePath: string, expected: string, actual: string): string {
  const debugDir = path.join(path.dirname(filePath), 'formatter-debug');
  fs.mkdirSync(debugDir, { recursive: true });
  const base = path.basename(filePath, '.tcl');
  const expectedPath = path.join(debugDir, `${base}.expected.tcl`);
  const actualPath = path.join(debugDir, `${base}.actual.tcl`);
  fs.writeFileSync(expectedPath, expected, 'utf8');
  fs.writeFileSync(actualPath, actual, 'utf8');
  return debugDir;
}

function createTempTclFile(rootDir: string, baseName: string, content: string): string {
  const unique = `${baseName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tcl`;
  const filePath = path.join(rootDir, unique);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

async function runFormatterCommand(filePath: string): Promise<void> {
  await vscode.commands.executeCommand('tcl.formatDocument', vscode.Uri.file(filePath));
  await sleep(200);
}

suite('Formatter Integration: Generated Files', () => {
  let tempDir: string;
  let previousInsertSpaces: boolean | undefined;
  let previousTabSize: number | undefined;
  const keptFiles: string[] = [];

  function shouldKeepFiles(): boolean {
    return process.env.KEEP_FORMATTER_TEST_FILES === '1';
  }

  suiteSetup(async function () {
    this.timeout(20000);
    await ensureExtensionActive();
    const editorCfg = vscode.workspace.getConfiguration('editor');
    previousInsertSpaces = editorCfg.get<boolean>('insertSpaces');
    previousTabSize = editorCfg.get<number>('tabSize');
    await editorCfg.update('insertSpaces', true, vscode.ConfigurationTarget.Global);
    await editorCfg.update('tabSize', 2, vscode.ConfigurationTarget.Global);
    // place generated files under the repository so they are easy to inspect
    const workspaceRoot = path.resolve(__dirname, '../../../../');
    const generatedRoot = path.join(workspaceRoot, 'test', 'generated', 'formatter');
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tempDir = path.join(generatedRoot, runId);
    fs.mkdirSync(tempDir, { recursive: true });

    if (shouldKeepFiles()) {
      console.log(`[formatter-test] KEEP_FORMATTER_TEST_FILES=1`);
      console.log(`[formatter-test] temp dir: ${tempDir}`);
    }
  });

  suiteTeardown(async function () {
    this.timeout(10000);
    const editorCfg = vscode.workspace.getConfiguration('editor');
    await editorCfg.update('insertSpaces', previousInsertSpaces, vscode.ConfigurationTarget.Global);
    await editorCfg.update('tabSize', previousTabSize, vscode.ConfigurationTarget.Global);

    if (shouldKeepFiles()) {
      if (keptFiles.length > 0) {
        console.log('[formatter-test] generated files:');
        for (const filePath of keptFiles) {
          console.log(`[formatter-test]   ${filePath}`);
        }
      }
      return;
    }

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  test('formats generated files and matches expected output', async function () {
    this.timeout(30000);

    const cases: FormatterCase[] = [
      {
        name: 'wrong-indent-and-inline-blocks',
        input: [
          'proc demo {} {',
          'set x 1',
          'if {$x} {puts "ok"}',
          '}',
          '',
        ].join('\n'),
        expected: [
          'proc demo {} {',
          '  set x 1',
          '  if {$x} {puts "ok"}',
          '}',
          '',
        ].join('\n'),
      },
      {
        name: 'quoted-and-commented-braces',
        input: [
          'proc demo2 {} {',
          '# if {0} { puts broken }',
          'set msg "literal { brace }"',
          'puts $msg',
          '}',
          '',
        ].join('\n'),
        expected: [
          'proc demo2 {} {',
          '# if {0} { puts broken }',
          '  set msg "literal { brace }"',
          '  puts $msg',
          '}',
          '',
        ].join('\n'),
      },
      {
        name: 'brackets-and-braces-on-same-line',
        input: [
          'proc demo3 {} {',
          'set res [expr {1 + [expr {2 + 3}]}]',
          'if {[string length $res] > 0} {puts $res}',
          '}',
          '',
        ].join('\n'),
        expected: [
          'proc demo3 {} {',
          '  set res [expr {1 + [expr {2 + 3}]}]',
          '  if {[string length $res] > 0} {puts $res}',
          '}',
          '',
        ].join('\n'),
      },
      {
        name: 'nested-if-statements',
        input: [
          'proc nestedDemo {a b} {',
          'if {$a > 0} {',
          'if {$b > 0} {',
          'puts "both positive"',
          '} else {',
          'puts "a positive only"',
          '}',
          '} else {',
          'if {$b > 0} {',
          'puts "b positive only"',
          '} else {',
          'puts "none positive"',
          '}',
          '}',
          '}',
          '',
        ].join('\n'),
        expected: [
          'proc nestedDemo {a b} {',
          '  if {$a > 0} {',
          '    if {$b > 0} {',
          '      puts "both positive"',
          '    } else {',
          '      puts "a positive only"',
          '    }',
          '  } else {',
          '    if {$b > 0} {',
          '      puts "b positive only"',
          '    } else {',
          '      puts "none positive"',
          '    }',
          '  }',
          '}',
          '',
        ].join('\n'),
      },
      {
        name: 'multiple-procs-and-namespace',
        input: [
          'proc topA {} {',
          'puts "A"',
          '}',
          'proc topB {x} {',
          'if {$x} {puts "x"}',
          '}',
          'namespace eval app {',
          'proc start {} {',
          'set ready 1',
          'if {$ready} {',
          'puts "started"',
          '}',
          '}',
          'proc stop {} {',
          'puts "stopped"',
          '}',
          '}',
          '',
        ].join('\n'),
        expected: [
          'proc topA {} {',
          '  puts "A"',
          '}',
          'proc topB {x} {',
          '  if {$x} {puts "x"}',
          '}',
          'namespace eval app {',
          '  proc start {} {',
          '    set ready 1',
          '    if {$ready} {',
          '      puts "started"',
          '    }',
          '  }',
          '  proc stop {} {',
          '    puts "stopped"',
          '  }',
          '}',
          '',
        ].join('\n'),
      },
    ];

    for (const c of cases) {
      const filePath = createTempTclFile(tempDir, c.name, c.input);
      if (shouldKeepFiles()) {
        keptFiles.push(filePath);
      }
      await runFormatterCommand(filePath);
      const actual = fs.readFileSync(filePath, 'utf8');

      if (actual !== c.expected) {
        const debugDir = writeDebugArtifacts(filePath, c.expected, actual);
        assert.fail(
          [
            `Formatter output mismatch for case '${c.name}'`,
            `file: ${filePath}`,
            `debug artifacts: ${debugDir}`,
            'diff:',
            formatDiff(c.expected, actual),
          ].join('\n'),
        );
      }
    }
  });

  test('leaves invalid bracket files unchanged', async function () {
    this.timeout(20000);

    const invalidInput = [
      'proc broken {} {',
      'puts "hello"',
      '}}',
      '',
    ].join('\n');

    const filePath = createTempTclFile(tempDir, 'invalid-brackets', invalidInput);
    if (shouldKeepFiles()) {
      keptFiles.push(filePath);
    }
    await runFormatterCommand(filePath);

    const after = fs.readFileSync(filePath, 'utf8');
    assert.strictEqual(
      after,
      invalidInput,
      'Invalid bracket content should remain unchanged when formatter refuses to format',
    );
  });
});