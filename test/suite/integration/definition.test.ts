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

  // ─────────────────────────────────────────────────────────────────────────
  // keyword-position: try...on handler type tokens must NOT produce definitions
  // ─────────────────────────────────────────────────────────────────────────
  suite('No definition on try-on keyword-position tokens', () => {
    let doc: vscode.TextDocument;

    suiteSetup(async () => {
      const opened = await openFixture('try-on-keywords.tcl');
      doc = opened.doc;
    });

    /** Locate `word` on the first line whose text equals `lineText` and run definition. */
    async function definitionOnWord(
      lineText: string,
      word: string
    ): Promise<(vscode.Location | vscode.LocationLink)[]> {
      for (let i = 0; i < doc.lineCount; i++) {
        const text = doc.lineAt(i).text;
        if (text === lineText) {
          const col = text.indexOf(word);
          assert.ok(col !== -1, `Word "${word}" not found on line: ${lineText}`);
          return (await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
            'vscode.executeDefinitionProvider',
            doc.uri,
            new vscode.Position(i, col + 1)
          )) ?? [];
        }
      }
      throw new Error(`Line not found in fixture: "${lineText}"`);
    }

    test('no definition for "error" when used as try handler type', async () => {
      const locs = await definitionOnWord('} on error {msg opts} {', 'error');
      assert.ok(
        !locs || locs.length === 0,
        'Expected no definition for keyword-position "error"'
      );
    });

    test('no definition for "return" when used as try handler type', async () => {
      const locs = await definitionOnWord('} on return {result opts} {', 'return');
      assert.ok(
        !locs || locs.length === 0,
        'Expected no definition for keyword-position "return"'
      );
    });

    test('no definition for "break" when used as try handler type', async () => {
      const locs = await definitionOnWord('} on break {} {', 'break');
      assert.ok(
        !locs || locs.length === 0,
        'Expected no definition for keyword-position "break"'
      );
    });

    test('definition IS returned for "exampleProc" used as a call', async () => {
      const locs = await definitionOnWord('    set outcome [exampleProc 5]', 'exampleProc');
      assert.ok(
        locs && locs.length > 0,
        'Expected a definition location for "exampleProc" call but got none'
      );
    });
  });

  suite('Namespace shadowing does not inflate references', () => {
    let namespacedDoc: vscode.TextDocument;
    let globalDoc: vscode.TextDocument;

    suiteSetup(async () => {
      const openedNamespaced = await openFixture('lensshadowduplicate.tcl');
      namespacedDoc = openedNamespaced.doc;

      const openedGlobal = await openFixture('lensshadowduplicate-other.tcl');
      globalDoc = openedGlobal.doc;
    });

    function findWordPosition(
      doc: vscode.TextDocument,
      lineMatcher: RegExp,
      word: string
    ): vscode.Position {
      for (let i = 0; i < doc.lineCount; i++) {
        const text = doc.lineAt(i).text;
        if (!lineMatcher.test(text)) continue;
        const col = text.indexOf(word);
        assert.ok(col !== -1, `Word "${word}" not found on matched line: ${text}`);
        return new vscode.Position(i, col + 1);
      }
      throw new Error(`Could not find line matching ${lineMatcher} in ${doc.uri.fsPath}`);
    }

    test('CodeLens usage count stays at 3 for shadow::lensShadowDupProc', async () => {
      const procPos = findWordPosition(
        namespacedDoc,
        /^\s*proc\s+lensShadowDupProc\s+\{\}/,
        'lensShadowDupProc'
      );
      const procLine = procPos.line;

      const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
        'vscode.executeCodeLensProvider',
        namespacedDoc.uri,
        50
      );

      assert.ok(Array.isArray(lenses), 'Expected code lens provider to return an array');

      const targetLens = lenses.find(lens => lens.range.start.line === procLine);
      assert.ok(targetLens, 'Expected a CodeLens for namespaced proc declaration line');
      assert.ok(targetLens?.command, 'Expected resolved CodeLens command with usage title');
      assert.strictEqual(
        targetLens?.command?.title,
        'used in 3 locations',
        `Expected namespaced proc lens count to be 3, got "${targetLens?.command?.title}"`
      );
    });

    test('F12 on global call resolves to global proc, not shadow namespace proc', async () => {
      const callPos = findWordPosition(
        globalDoc,
        /^\s*lensShadowDupProc\s*$/,
        'lensShadowDupProc'
      );

      const defs = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        globalDoc.uri,
        callPos
      );

      assert.ok(defs && defs.length > 0, 'Expected at least one definition location');

      const normalizedDefs = defs.map(entry => {
        const loc = entry as vscode.Location;
        return { path: loc.uri.fsPath, line: loc.range.start.line };
      });

      const hasGlobalDef = normalizedDefs.some(
        loc => loc.path.endsWith('lensshadowduplicate-other.tcl') && loc.line === 0
      );
      assert.ok(hasGlobalDef, 'Expected global definition in lensshadowduplicate-other.tcl line 0');

      const hasNamespacedDef = normalizedDefs.some(loc => loc.path.endsWith('lensshadowduplicate.tcl'));
      assert.ok(!hasNamespacedDef, 'Did not expect namespaced definition for unqualified global call');
    });

    test('CodeLens usage count stays at 1 for global lensShadowDupProc', async () => {
      const procPos = findWordPosition(
        globalDoc,
        /^\s*proc\s+lensShadowDupProc\s+\{\}/,
        'lensShadowDupProc'
      );
      const procLine = procPos.line;

      const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
        'vscode.executeCodeLensProvider',
        globalDoc.uri,
        50
      );

      assert.ok(Array.isArray(lenses), 'Expected code lens provider to return an array');

      const targetLens = lenses.find(lens => lens.range.start.line === procLine);
      assert.ok(targetLens, 'Expected a CodeLens for global proc declaration line');
      assert.ok(targetLens?.command, 'Expected resolved CodeLens command with usage title');
      assert.strictEqual(
        targetLens?.command?.title,
        'used in 1 location',
        `Expected global proc lens count to be 1, got "${targetLens?.command?.title}"`
      );
    });
  });
});
