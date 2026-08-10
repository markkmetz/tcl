import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  openFixture,
  closeAllEditors,
  ensureExtensionActive,
  completionLabels,
} from './helpers';

function completionInsertText(item: vscode.CompletionItem): string {
  const insertText = item.insertText;
  if (typeof insertText === 'string') {
    return insertText;
  }
  if (insertText instanceof vscode.SnippetString) {
    return insertText.value;
  }
  const label = typeof item.label === 'string' ? item.label : item.label.label;
  return label;
}

function applyCompletionToSingleLine(
  original: string,
  item: vscode.CompletionItem,
  fallbackPos: vscode.Position
): string {
  const text = completionInsertText(item);
  const range = item.range as vscode.Range | { replacing?: vscode.Range } | undefined;
  let start = fallbackPos.character;
  let end = fallbackPos.character;

  if (range instanceof vscode.Range) {
    start = range.start.character;
    end = range.end.character;
  } else if (range?.replacing) {
    start = range.replacing.start.character;
    end = range.replacing.end.character;
  }

  return `${original.slice(0, start)}${text}${original.slice(end)}`;
}

suite('Completion Provider', () => {
  suiteSetup(async () => {
    await ensureExtensionActive();
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  suite('Builtin commands', () => {
    let list: vscode.CompletionList;

    suiteSetup(async () => {
      const { doc } = await openFixture('sample.tcl');
      // Trigger at line 1 (empty line) — no prefix, all completions returned
      const pos = new vscode.Position(1, 0);
      list = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        pos
      );
    });

    test('completion list is non-empty', () => {
      assert.ok(list && list.items.length > 0, 'Expected completions but got none');
    });

    test('includes "set" builtin', () => {
      const labels = completionLabels(list);
      assert.ok(labels.includes('set'), `"set" not found in: ${labels.slice(0, 15).join(', ')}`);
    });

    test('includes "puts" builtin', () => {
      const labels = completionLabels(list);
      assert.ok(labels.includes('puts'), `"puts" not found in: ${labels.slice(0, 15).join(', ')}`);
    });

    test('includes "foreach" builtin', () => {
      const labels = completionLabels(list);
      assert.ok(labels.includes('foreach'), `"foreach" not found in completions`);
    });

    test('builtin items have Function or Snippet kind', () => {
      const setItem = list.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'set';
      });
      assert.ok(setItem, '"set" item not found');
      assert.ok(
        setItem.kind === vscode.CompletionItemKind.Function ||
        setItem.kind === vscode.CompletionItemKind.Snippet,
        `Expected Function or Snippet kind for "set", got ${setItem.kind}`
      );
    });

    test('builtin item has detail text', () => {
      const putsItem = list.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'puts';
      });
      assert.ok(putsItem, '"puts" item not found');
      assert.ok(putsItem.detail, '"puts" completion item should have detail text');
    });
  });

  suite('Proc completions from indexed file', () => {
    let list: vscode.CompletionList;

    suiteSetup(async () => {
      const { doc } = await openFixture('sample.tcl');
      const pos = new vscode.Position(1, 0);
      list = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        pos
      );
    });

    test('includes proc "foo" defined in same file', () => {
      const labels = completionLabels(list);
      assert.ok(labels.includes('foo'), `"foo" not found in completions`);
    });

    test('proc item has Function kind', () => {
      const fooItem = list.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'foo';
      });
      assert.ok(fooItem, '"foo" completion item not found');
      assert.strictEqual(
        fooItem.kind,
        vscode.CompletionItemKind.Function,
        `Expected Function kind for proc "foo", got ${fooItem.kind}`
      );
    });

    test('proc item insertText includes parameter snippets', () => {
      const fooItem = list.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'foo';
      });
      assert.ok(fooItem, '"foo" completion item not found');
      const insertText = fooItem.insertText;
      assert.ok(insertText, '"foo" should have an insertText');
      const text = typeof insertText === 'string'
        ? insertText
        : (insertText as vscode.SnippetString).value;
      // Should contain snippet placeholders for parameters a and b
      assert.ok(text.includes('$'), `Expected snippet placeholders in insertText, got: ${text}`);
    });

    test('ignores leading :: when filtering global proc completions', async () => {
      const noGlobalTyped = 'gp';
      const noGlobalDoc = await vscode.workspace.openTextDocument({ language: 'tcl', content: noGlobalTyped });
      await vscode.window.showTextDocument(noGlobalDoc);
      const noGlobalPos = new vscode.Position(0, noGlobalTyped.length);
      const noGlobalList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        noGlobalDoc.uri,
        noGlobalPos
      );
      const hasNoGlobal = noGlobalList.items.some(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'gproc';
      });
      assert.ok(hasNoGlobal, 'Expected global proc completion for "gproc" after "gp"');

      const globalTyped = '::gp';
      const globalDoc = await vscode.workspace.openTextDocument({ language: 'tcl', content: globalTyped });
      await vscode.window.showTextDocument(globalDoc);
      const globalPos = new vscode.Position(0, globalTyped.length);
      const globalList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        globalDoc.uri,
        globalPos
      );
      const hasGlobal = globalList.items.some(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'gproc';
      });
      assert.ok(hasGlobal, 'Expected global proc completion for "gproc" after "::gp"');
    });
  });

  suite('Namespace completions', () => {
    let list: vscode.CompletionList;
    let doc: vscode.TextDocument;

    suiteSetup(async () => {
      const opened = await openFixture('sample.tcl');
      doc = opened.doc;
      const pos = new vscode.Position(1, 0);
      list = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        pos
      );
    });

    test('includes namespace "ns1::" as a Module completion', () => {
      const nsItem = list.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns1::';
      });
      assert.ok(nsItem, '"ns1::" namespace completion not found');
      assert.strictEqual(
        nsItem.kind,
        vscode.CompletionItemKind.Module,
        `Expected Module kind for namespace, got ${nsItem.kind}`
      );
    });

    test('keeps no-leading-colon namespace insertion as "ns::"', async () => {
      const typed = 'ns2';
      const scratch = await vscode.workspace.openTextDocument({ language: 'tcl', content: typed });
      await vscode.window.showTextDocument(scratch);
      const pos = new vscode.Position(0, typed.length);
      const nsList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        scratch.uri,
        pos
      );

      const nsItem = nsList.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns2::' && item.kind === vscode.CompletionItemKind.Module;
      });

      assert.ok(nsItem, 'Expected namespace completion for "ns2::"');
      const insertText = nsItem!.insertText;
      const text = typeof insertText === 'string'
        ? insertText
        : (insertText as vscode.SnippetString | undefined)?.value;
      assert.strictEqual(text, 'ns2::');
    });

    test('keeps leading-colon namespace insertion as "::ns::" and replaces full token', async () => {
      const typed = '::ns1';
      const scratch = await vscode.workspace.openTextDocument({ language: 'tcl', content: typed });
      await vscode.window.showTextDocument(scratch);
      const pos = new vscode.Position(0, typed.length);
      const nsList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        scratch.uri,
        pos
      );

      const nsItem = nsList.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns1::' && item.kind === vscode.CompletionItemKind.Module;
      });

      assert.ok(nsItem, 'Expected namespace completion for "ns1::"');

      const insertText = nsItem!.insertText;
      const text = typeof insertText === 'string'
        ? insertText
        : (insertText as vscode.SnippetString | undefined)?.value;
      assert.strictEqual(text, '::ns1::');

      const range = nsItem!.range as vscode.Range | { inserting?: vscode.Range; replacing?: vscode.Range } | undefined;
      // Completion range must start at the first ':' so typed '::' is replaced,
      // preventing accidental '::::' prefixes when accepting completion.
      if (range instanceof vscode.Range) {
        assert.strictEqual(range.start.character, 0);
      } else if (range && range.replacing) {
        assert.strictEqual(range.replacing.start.character, 0);
      }
    });

    test('applying selected namespace completion never yields four leading colons', async () => {
      const noGlobalTyped = 'ns2';
      const noGlobalDoc = await vscode.workspace.openTextDocument({ language: 'tcl', content: noGlobalTyped });
      await vscode.window.showTextDocument(noGlobalDoc);
      const noGlobalPos = new vscode.Position(0, noGlobalTyped.length);
      const noGlobalList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        noGlobalDoc.uri,
        noGlobalPos
      );
      const noGlobalItem = noGlobalList.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns2::' && item.kind === vscode.CompletionItemKind.Module;
      });
      assert.ok(noGlobalItem, 'Expected namespace completion for "ns2::"');
      const noGlobalApplied = applyCompletionToSingleLine(noGlobalTyped, noGlobalItem!, noGlobalPos);
      assert.strictEqual(noGlobalApplied, 'ns2::');

      const globalTyped = '::ns1';
      const globalDoc = await vscode.workspace.openTextDocument({ language: 'tcl', content: globalTyped });
      await vscode.window.showTextDocument(globalDoc);
      const globalPos = new vscode.Position(0, globalTyped.length);
      const globalList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        globalDoc.uri,
        globalPos
      );
      const globalItem = globalList.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns1::' && item.kind === vscode.CompletionItemKind.Module;
      });
      assert.ok(globalItem, 'Expected namespace completion for "ns1::"');
      const globalApplied = applyCompletionToSingleLine(globalTyped, globalItem!, globalPos);
      assert.strictEqual(globalApplied, '::ns1::');
      assert.ok(!globalApplied.startsWith('::::'), `Unexpected duplicated colons: ${globalApplied}`);
    });

    test('offers proc completions after typing fully qualified namespace in either style', async () => {
      const docNoGlobal = await vscode.workspace.openTextDocument({ language: 'tcl', content: 'ns2::' });
      await vscode.window.showTextDocument(docNoGlobal);
      const posNoGlobal = new vscode.Position(0, 'ns2::'.length);
      const noGlobalList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        docNoGlobal.uri,
        posNoGlobal
      );
      const hasBuzzNoGlobal = noGlobalList.items.some(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns2::buzz';
      });
      assert.ok(hasBuzzNoGlobal, 'Expected proc completion for "ns2::buzz" after "ns2::"');

      const docGlobal = await vscode.workspace.openTextDocument({ language: 'tcl', content: '::ns1::' });
      await vscode.window.showTextDocument(docGlobal);
      const posGlobal = new vscode.Position(0, '::ns1::'.length);
      const globalList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        docGlobal.uri,
        posGlobal
      );
      const hasFooGlobal = globalList.items.some(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns1::foo';
      });
      assert.ok(hasFooGlobal, 'Expected proc completion for "ns1::foo" after "::ns1::"');
    });

    test('treats leading :: as optional when completing namespaced procs', async () => {
      const noGlobalTyped = 'ns4::ba';
      const noGlobalDoc = await vscode.workspace.openTextDocument({ language: 'tcl', content: noGlobalTyped });
      await vscode.window.showTextDocument(noGlobalDoc);
      const noGlobalPos = new vscode.Position(0, noGlobalTyped.length);
      const noGlobalList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        noGlobalDoc.uri,
        noGlobalPos
      );
      const hasNoGlobalMatch = noGlobalList.items.some(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns4::bar';
      });
      assert.ok(hasNoGlobalMatch, 'Expected proc completion for "ns4::bar" after "ns4::ba"');

      const globalTyped = '::ns4::ba';
      const globalDoc = await vscode.workspace.openTextDocument({ language: 'tcl', content: globalTyped });
      await vscode.window.showTextDocument(globalDoc);
      const globalPos = new vscode.Position(0, globalTyped.length);
      const globalList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        globalDoc.uri,
        globalPos
      );
      const hasGlobalMatch = globalList.items.some(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns4::bar';
      });
      assert.ok(hasGlobalMatch, 'Expected proc completion for "ns4::bar" after "::ns4::ba"');
    });

    test('treats leading :: as optional when completing namespace names', async () => {
      const noGlobalTyped = 'ns4';
      const noGlobalDoc = await vscode.workspace.openTextDocument({ language: 'tcl', content: noGlobalTyped });
      await vscode.window.showTextDocument(noGlobalDoc);
      const noGlobalPos = new vscode.Position(0, noGlobalTyped.length);
      const noGlobalList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        noGlobalDoc.uri,
        noGlobalPos
      );
      const hasNoGlobalMatch = noGlobalList.items.some(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns4::' && item.kind === vscode.CompletionItemKind.Module;
      });
      assert.ok(hasNoGlobalMatch, 'Expected namespace completion for "ns4::" after "ns4"');

      const globalTyped = '::ns4';
      const globalDoc = await vscode.workspace.openTextDocument({ language: 'tcl', content: globalTyped });
      await vscode.window.showTextDocument(globalDoc);
      const globalPos = new vscode.Position(0, globalTyped.length);
      const globalList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        globalDoc.uri,
        globalPos
      );
      const hasGlobalMatch = globalList.items.some(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns4::' && item.kind === vscode.CompletionItemKind.Module;
      });
      assert.ok(hasGlobalMatch, 'Expected namespace completion for "ns4::" after "::ns4"');
    });

    test('offers namespaced proc completions when only namespace token is typed', async () => {
      const localTyped = 'ns1';
      const localDoc = await vscode.workspace.openTextDocument({ language: 'tcl', content: localTyped });
      await vscode.window.showTextDocument(localDoc);
      const localPos = new vscode.Position(0, localTyped.length);
      const localList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        localDoc.uri,
        localPos
      );

      const localProcItem = localList.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns1::foo' && item.kind === vscode.CompletionItemKind.Function;
      });
      assert.ok(localProcItem, 'Expected proc completion "ns1::foo" after typing "ns1"');

      const localApplied = applyCompletionToSingleLine(localTyped, localProcItem!, localPos);
      assert.ok(localApplied.startsWith('ns1::foo'), `Expected insertion to keep local namespace style, got: ${localApplied}`);

      const globalTyped = '::ns1';
      const globalDoc = await vscode.workspace.openTextDocument({ language: 'tcl', content: globalTyped });
      await vscode.window.showTextDocument(globalDoc);
      const globalPos = new vscode.Position(0, globalTyped.length);
      const globalList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        globalDoc.uri,
        globalPos
      );

      const globalProcItem = globalList.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns1::foo' && item.kind === vscode.CompletionItemKind.Function;
      });
      assert.ok(globalProcItem, 'Expected proc completion "ns1::foo" after typing "::ns1"');

      const globalApplied = applyCompletionToSingleLine(globalTyped, globalProcItem!, globalPos);
      assert.ok(globalApplied.startsWith('::ns1::foo'), `Expected insertion to keep global namespace style, got: ${globalApplied}`);
    });

    test('returns identical namespaced proc labels for ns and ::ns across multiple namespaces', async () => {
      const functionLabelsForInput = async (typed: string, expectedPrefix: string): Promise<string[]> => {
        const scratch = await vscode.workspace.openTextDocument({ language: 'tcl', content: typed });
        await vscode.window.showTextDocument(scratch);
        const pos = new vscode.Position(0, typed.length);
        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          scratch.uri,
          pos
        );

        return list.items
          .filter(item => item.kind === vscode.CompletionItemKind.Function)
          .map(item => (typeof item.label === 'string' ? item.label : item.label.label))
          .filter(label => label.startsWith(`${expectedPrefix}::`))
          .sort();
      };

      const ns1Local = await functionLabelsForInput('ns1', 'ns1');
      const ns1Global = await functionLabelsForInput('::ns1', 'ns1');
      assert.ok(ns1Local.length > 0, 'Expected namespaced proc completions for "ns1"');
      assert.deepStrictEqual(ns1Global, ns1Local, 'Expected identical ns1 proc labels for "ns1" and "::ns1"');

      const ns2Local = await functionLabelsForInput('ns2', 'ns2');
      const ns2Global = await functionLabelsForInput('::ns2', 'ns2');
      assert.ok(ns2Local.length > 0, 'Expected namespaced proc completions for "ns2"');
      assert.deepStrictEqual(ns2Global, ns2Local, 'Expected identical ns2 proc labels for "ns2" and "::ns2"');
    });

    test('ignores redundant leading colons when completing namespace names', async () => {
      const redundantTyped = ':::ns4';
      const redundantDoc = await vscode.workspace.openTextDocument({ language: 'tcl', content: redundantTyped });
      await vscode.window.showTextDocument(redundantDoc);
      const redundantPos = new vscode.Position(0, redundantTyped.length);
      const redundantList = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        redundantDoc.uri,
        redundantPos
      );

      const nsItem = redundantList.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'ns4::' && item.kind === vscode.CompletionItemKind.Module;
      });

      const moduleLabels = redundantList.items
        .filter(item => item.kind === vscode.CompletionItemKind.Module)
        .map(item => (typeof item.label === 'string' ? item.label : item.label.label));
      const firstLabels = redundantList.items
        .slice(0, 15)
        .map(item => `${typeof item.label === 'string' ? item.label : item.label.label}:${item.kind}`);

      assert.ok(
        nsItem,
        `Expected namespace completion for "ns4::" after ":::ns4"; module labels: ${moduleLabels.join(', ')}; first labels: ${firstLabels.join(', ')}`
      );
      const insertText = nsItem!.insertText;
      const text = typeof insertText === 'string'
        ? insertText
        : (insertText as vscode.SnippetString | undefined)?.value;
      assert.strictEqual(text, '::ns4::');
    });
  });

  suite('Dictionary key completions', () => {
    let list: vscode.CompletionList;

    suiteSetup(async () => {
      // dicts.tcl defines: set config [dict create host ... port ... debug ... paths ...]
      // Line 32 is: set hostname [dict get $config host]
      // We test completion after "dict get $config " at a position in the file
      // where $config is in scope — find "dict get $config host" and test at key position
      const { doc } = await openFixture('dicts.tcl');

      // Find the line with "dict get $config host" to locate a key-position
      let keyPos: vscode.Position | undefined;
      for (let i = 0; i < doc.lineCount; i++) {
        const text = doc.lineAt(i).text;
        if (text.includes('dict get $config host')) {
          // Position at the end of "dict get $config " — one char before "host"
          const col = text.indexOf('host');
          keyPos = new vscode.Position(i, col);
          break;
        }
      }
      assert.ok(keyPos, 'Could not find "dict get $config host" line in dicts.tcl');

      list = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        keyPos!
      );
    });

    test('dict key completions are non-empty', () => {
      assert.ok(list && list.items.length > 0, 'Expected dict key completions');
    });

    test('includes "host" key from $config dict', () => {
      const labels = completionLabels(list);
      assert.ok(labels.includes('host'), `"host" not found in dict completions: ${labels.join(', ')}`);
    });

    test('includes "port" key from $config dict', () => {
      const labels = completionLabels(list);
      assert.ok(labels.includes('port'), `"port" not found in dict completions`);
    });

    test('dict key items use Property kind when enriched metadata is available', () => {
      const hostItems = list.items.filter(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'host';
      });
      assert.ok(hostItems.length > 0, '"host" key item not found');

      // Completion lists can be merged with fallback text completions.
      // If an enriched dict-key item is present, it should be Property kind.
      const enrichedHostItem = hostItems.find(
        item => item.kind === vscode.CompletionItemKind.Property || typeof item.detail === 'string'
      );
      if (!enrichedHostItem) {
        return;
      }

      assert.strictEqual(
        enrichedHostItem.kind,
        vscode.CompletionItemKind.Property,
        `Expected Property kind for enriched dict key item, got ${enrichedHostItem.kind}`
      );
    });

    test('dict key item detail references the dict variable when detail is present', () => {
      const hostItems = list.items.filter(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'host';
      });
      assert.ok(hostItems.length > 0, '"host" key item not found');
      const detailedHostItem = hostItems.find(item => typeof item.detail === 'string');
      if (!detailedHostItem) {
        return;
      }
      assert.ok(
        String(detailedHostItem.detail).toLowerCase().includes('config'),
        `Detail should reference "config" dict, got: ${detailedHostItem.detail}`
      );
    });
  });

  suite('Snippet completions', () => {
    let list: vscode.CompletionList;

    suiteSetup(async () => {
      const { doc } = await openFixture('sample.tcl');
      const pos = new vscode.Position(1, 0);
      list = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        pos
      );
    });

    test('includes "proc" snippet', () => {
      const procSnippet = list.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'proc' && item.kind === vscode.CompletionItemKind.Snippet;
      });
      assert.ok(procSnippet, '"proc" snippet not found');
    });

    test('"proc" snippet insertText uses tab stops', () => {
      const procSnippet = list.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'proc' && item.kind === vscode.CompletionItemKind.Snippet;
      });
      assert.ok(procSnippet, '"proc" snippet not found');
      const insertText = procSnippet.insertText;
      assert.ok(insertText instanceof vscode.SnippetString, 'Expected SnippetString insertText');
      assert.ok(
        (insertText as vscode.SnippetString).value.includes('${1:'),
        'Expected tab-stop placeholders in proc snippet'
      );
    });
  });
});
