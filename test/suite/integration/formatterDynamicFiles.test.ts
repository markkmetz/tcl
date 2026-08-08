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

  suiteSetup(async function () {
    this.timeout(20000);
    await ensureExtensionActive();
    const editorCfg = vscode.workspace.getConfiguration('editor');
    previousInsertSpaces = editorCfg.get<boolean>('insertSpaces');
    previousTabSize = editorCfg.get<number>('tabSize');
    await editorCfg.update('insertSpaces', true, vscode.ConfigurationTarget.Global);
    await editorCfg.update('tabSize', 2, vscode.ConfigurationTarget.Global);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcl-formatter-int-'));
  });

  suiteTeardown(async function () {
    this.timeout(10000);
    const editorCfg = vscode.workspace.getConfiguration('editor');
    await editorCfg.update('insertSpaces', previousInsertSpaces, vscode.ConfigurationTarget.Global);
    await editorCfg.update('tabSize', previousTabSize, vscode.ConfigurationTarget.Global);
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
    ];

    for (const c of cases) {
      const filePath = createTempTclFile(tempDir, c.name, c.input);
      await runFormatterCommand(filePath);
      const actual = fs.readFileSync(filePath, 'utf8');
      assert.strictEqual(
        actual,
        c.expected,
        `Formatter output mismatch for case '${c.name}'`,
      );
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
    await runFormatterCommand(filePath);

    const after = fs.readFileSync(filePath, 'utf8');
    assert.strictEqual(
      after,
      invalidInput,
      'Invalid bracket content should remain unchanged when formatter refuses to format',
    );
  });
});