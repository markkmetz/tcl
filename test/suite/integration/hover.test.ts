import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  openFixture,
  closeAllEditors,
  ensureExtensionActive,
  hoverText,
} from './helpers';

suite('Hover Provider', () => {
  suiteSetup(async () => {
    await ensureExtensionActive();
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  suite('Proc definition hover', () => {
    // sample.tcl line 5: "  proc foo {a {b 1}} {"
    // "foo" starts at col 7
    let hovers: vscode.Hover[];

    suiteSetup(async () => {
      const { doc } = await openFixture('sample.tcl');
      const pos = new vscode.Position(5, 8); // middle of "foo"
      hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        doc.uri,
        pos
      );
    });

    test('hover is returned', () => {
      assert.ok(hovers && hovers.length > 0, 'Expected hover but got none');
    });

    test('hover text contains proc name "foo"', () => {
      const text = hoverText(hovers);
      assert.ok(text.includes('foo'), `Expected "foo" in hover text, got: ${text}`);
    });

    test('hover text contains parameter "a"', () => {
      const text = hoverText(hovers);
      assert.ok(text.includes('a'), `Expected parameter "a" in hover text, got: ${text}`);
    });

    test('hover text contains parameter "b"', () => {
      const text = hoverText(hovers);
      assert.ok(text.includes('b'), `Expected parameter "b" in hover text, got: ${text}`);
    });

    test('hover text contains "Procedure" label', () => {
      const text = hoverText(hovers);
      assert.ok(
        text.toLowerCase().includes('procedure') || text.toLowerCase().includes('proc'),
        `Expected "Procedure" or "proc" in hover text, got: ${text}`
      );
    });
  });

  suite('Builtin command hover', () => {
    // sample.tcl line 8: "    puts $a"
    // "puts" starts at col 4
    let hovers: vscode.Hover[];

    suiteSetup(async () => {
      const { doc } = await openFixture('sample.tcl');
      const pos = new vscode.Position(8, 5); // middle of "puts"
      hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        doc.uri,
        pos
      );
    });

    test('hover is returned for builtin', () => {
      assert.ok(hovers && hovers.length > 0, 'Expected hover for builtin "puts" but got none');
    });

    test('hover text contains "puts"', () => {
      const text = hoverText(hovers);
      assert.ok(text.includes('puts'), `Expected "puts" in hover text, got: ${text}`);
    });

    test('hover text contains "Builtin" label', () => {
      const text = hoverText(hovers);
      assert.ok(
        text.toLowerCase().includes('builtin') || text.toLowerCase().includes('built-in'),
        `Expected "Builtin" in hover text for "puts", got: ${text}`
      );
    });
  });

  suite('Variable hover', () => {
    // var-same-file.tcl:
    //   line 0: set myvar "value1"
    //   line 2: puts $myvar
    // "$myvar" on line 2: "$" at col 5, "myvar" at cols 6-10
    let hovers: vscode.Hover[];

    suiteSetup(async () => {
      const { doc } = await openFixture('var-same-file.tcl');
      const pos = new vscode.Position(2, 7); // middle of "$myvar"
      hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        doc.uri,
        pos
      );
    });

    test('hover is returned for variable', () => {
      assert.ok(hovers && hovers.length > 0, 'Expected hover for "$myvar" but got none');
    });

    test('hover text contains variable name "myvar"', () => {
      const text = hoverText(hovers);
      assert.ok(text.includes('myvar'), `Expected "myvar" in hover text, got: ${text}`);
    });

    test('hover text contains "Variable" label', () => {
      const text = hoverText(hovers);
      assert.ok(
        text.toLowerCase().includes('variable'),
        `Expected "Variable" in hover text, got: ${text}`
      );
    });
  });

  suite('Dict variable hover', () => {
    // dicts.tcl: set config [dict create host "localhost" port 8080 ...]
    // On a line that accesses $config, hover should show dict keys
    let hovers: vscode.Hover[];

    suiteSetup(async () => {
      const { doc } = await openFixture('dicts.tcl');

      // Find "dict get $config" to locate $config in the document
      let configPos: vscode.Position | undefined;
      for (let i = 0; i < doc.lineCount; i++) {
        const text = doc.lineAt(i).text;
        const idx = text.indexOf('$config');
        if (idx !== -1) {
          configPos = new vscode.Position(i, idx + 2); // middle of "$config"
          break;
        }
      }
      assert.ok(configPos, 'Could not find "$config" in dicts.tcl');

      hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        doc.uri,
        configPos!
      );
    });

    test('hover is returned for dict variable', () => {
      assert.ok(hovers && hovers.length > 0, 'Expected hover for dict "$config" but got none');
    });

    test('hover text contains "config"', () => {
      const text = hoverText(hovers);
      assert.ok(text.includes('config'), `Expected "config" in hover text, got: ${text}`);
    });

    test('hover text lists dict key "host"', () => {
      const text = hoverText(hovers);
      assert.ok(text.includes('host'), `Expected dict key "host" in hover text, got: ${text}`);
    });

    test('hover text lists dict key "port"', () => {
      const text = hoverText(hovers);
      assert.ok(text.includes('port'), `Expected dict key "port" in hover text, got: ${text}`);
    });
  });

  suite('No hover on whitespace', () => {
    test('hover on empty line returns empty or no results', async () => {
      const { doc } = await openFixture('sample.tcl');
      const pos = new vscode.Position(1, 0); // empty line
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        doc.uri,
        pos
      );
      // Acceptable: null, undefined, or empty array
      assert.ok(
        !hovers || hovers.length === 0,
        `Expected no hover on empty line but got: ${JSON.stringify(hovers)}`
      );
    });
  });
});
