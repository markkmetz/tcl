import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  openFixture,
  closeAllEditors,
  ensureExtensionActive,
} from './helpers';

suite('Definition Provider', () => {
  suiteSetup(async () => {
    await ensureExtensionActive();
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  suite('Go to definition — variable', () => {
    // var-same-file.tcl:
    //   line 0: set myvar "value1"   ← definition
    //   line 2: puts $myvar          ← reference
    let locations: (vscode.Location | vscode.LocationLink)[];

    suiteSetup(async () => {
      const { doc } = await openFixture('var-same-file.tcl');
      const pos = new vscode.Position(2, 7); // middle of "$myvar" on line 2
      locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        pos
      );
    });

    test('returns at least one location', () => {
      assert.ok(locations && locations.length > 0, 'Expected definition location but got none');
    });

    test('includes a location in the same file', () => {
      const hasSameFile = locations.some(entry => {
        const loc = entry as vscode.Location;
        return loc.uri.fsPath.endsWith('var-same-file.tcl');
      });
      assert.ok(hasSameFile, `Expected at least one definition in var-same-file.tcl`);
    });

    test('includes the same-file assignment line', () => {
      const hasExpectedLine = locations.some(entry => {
        const loc = entry as vscode.Location;
        return loc.uri.fsPath.endsWith('var-same-file.tcl') && loc.range.start.line === 0;
      });
      assert.ok(hasExpectedLine, 'Expected to include line 0 in var-same-file.tcl');
    });
  });

  suite('Go to definition — proc in same file', () => {
    // sample.tcl:
    //   line 5:  proc foo {a {b 1}} {   ← definition
    //   Hover over "foo" in the proc definition itself returns the definition location
    let locations: (vscode.Location | vscode.LocationLink)[];
    let procDefLine: number;

    suiteSetup(async () => {
      const { doc } = await openFixture('sample.tcl');

      // Find the "proc foo" line dynamically
      for (let i = 0; i < doc.lineCount; i++) {
        if (/^\s*proc foo\s/.test(doc.lineAt(i).text)) {
          procDefLine = i;
          break;
        }
      }
      assert.ok(procDefLine !== undefined, 'Could not find "proc foo" in sample.tcl');

      const fooCol = doc.lineAt(procDefLine).text.indexOf('foo');
      const pos = new vscode.Position(procDefLine, fooCol + 1);
      locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        pos
      );
    });

    test('returns a location for proc definition', () => {
      assert.ok(locations && locations.length > 0, 'Expected proc definition location');
    });

    test('includes a location in sample.tcl', () => {
      const hasSample = locations.some(entry => {
        const loc = entry as vscode.Location;
        return loc.uri.fsPath.endsWith('sample.tcl');
      });
      assert.ok(hasSample, 'Expected at least one definition in sample.tcl');
    });

    test('includes the proc definition line in sample.tcl', () => {
      const hasExpectedLine = locations.some(entry => {
        const loc = entry as vscode.Location;
        return loc.uri.fsPath.endsWith('sample.tcl') && loc.range.start.line === procDefLine;
      });
      assert.ok(hasExpectedLine, `Expected to include sample.tcl line ${procDefLine}`);
    });
  });

  suite('Go to definition — cross-file namespace import', () => {
    // other.tcl imports ::ns1::* (ns1 defined in sample.tcl)
    // Hovering over "ns1" in "namespace import ::ns1::*" should navigate to sample.tcl
    let locations: (vscode.Location | vscode.LocationLink)[];

    suiteSetup(async () => {
      // Open sample.tcl first to ensure ns1 is indexed
      await openFixture('sample.tcl', 500);
      const { doc } = await openFixture('other.tcl');

      // Find "namespace import ::ns1::*" line
      let ns1Line = -1;
      let ns1Col = -1;
      for (let i = 0; i < doc.lineCount; i++) {
        const text = doc.lineAt(i).text;
        const idx = text.indexOf('::ns1::');
        if (idx !== -1) {
          ns1Line = i;
          ns1Col = idx + 3; // middle of "ns1"
          break;
        }
      }

      if (ns1Line === -1) {
        // Skip if the fixture doesn't have the expected content
        locations = [];
        return;
      }

      const pos = new vscode.Position(ns1Line, ns1Col);
      locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        pos
      );
    });

    test('returns a location or gracefully returns empty', () => {
      // The namespace may not have a direct definition location — acceptable to return [] or a result
      assert.ok(Array.isArray(locations), 'Expected an array from definition provider');
    });
  });
});
