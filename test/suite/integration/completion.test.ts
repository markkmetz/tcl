import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  openFixture,
  closeAllEditors,
  ensureExtensionActive,
  completionLabels,
} from './helpers';

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
  });

  suite('Namespace completions', () => {
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

    test('dict key items have Property kind', () => {
      const hostItem = list.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'host';
      });
      assert.ok(hostItem, '"host" key item not found');
      assert.strictEqual(
        hostItem.kind,
        vscode.CompletionItemKind.Property,
        `Expected Property kind for dict key, got ${hostItem.kind}`
      );
    });

    test('dict key item detail references the dict variable', () => {
      const hostItem = list.items.find(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        return label === 'host';
      });
      assert.ok(hostItem, '"host" key item not found');
      assert.ok(hostItem.detail, 'Dict key item should have detail text');
      assert.ok(
        hostItem.detail.includes('config'),
        `Detail should reference "config" dict, got: ${hostItem.detail}`
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
