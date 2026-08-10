import * as assert from 'assert';
import * as vscode from 'vscode';
import { TclIndexer } from '../../../src/indexer';
import { TclSemanticProvider } from '../../../src/semanticProvider';
import { closeAllEditors, ensureExtensionActive, sleep } from './helpers';

const TOKEN_TYPE_NAMES = [
  'variable',
  'function',
  'parameter',
  'method',
  'keyword',
  'namespace',
  'dictKey',
  'dictValue',
  'dictCommand',
  'dictSubcommand',
] as const;

function decodeSemanticTokens(tokens: vscode.SemanticTokens): Array<{ line: number; startCharacter: number; length: number; type: string }> {
  const seen: Array<{ line: number; startCharacter: number; length: number; type: string }> = [];
  const data = Array.from(tokens.data);
  let line = 0;
  let char = 0;

  for (let index = 0; index < data.length; index += 5) {
    const deltaLine = data[index];
    const deltaStartChar = data[index + 1];
    const length = data[index + 2];
    const tokenType = data[index + 3];
    const tokenModifiers = data[index + 4];

    if (deltaLine > 0) {
      line += deltaLine;
      char = deltaStartChar;
    } else {
      char += deltaStartChar;
    }

    if (tokenModifiers !== 0) {
      // The regression is about token presence and position, not modifier flags.
    }

    seen.push({
      line,
      startCharacter: char,
      length,
      type: TOKEN_TYPE_NAMES[tokenType] || `token-${tokenType}`,
    });
  }

  return seen;
}

async function getSemanticTokenSummary(doc: vscode.TextDocument): Promise<Array<{ line: number; startCharacter: number; length: number; type: string; text: string }>> {
  const provider = new TclSemanticProvider(new TclIndexer());
  const tokens = await provider.provideDocumentSemanticTokens(doc, new vscode.CancellationTokenSource().token);
  const decoded = decodeSemanticTokens(tokens);
  return decoded.map(token => ({
    ...token,
    text: doc.lineAt(token.line).text.slice(token.startCharacter, token.startCharacter + token.length),
  }));
}

async function openTemporaryDocument(content: string): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument({
    language: 'tcl',
    content,
  });
  await vscode.window.showTextDocument(doc);
  await sleep(750);
  return doc;
}

suite('Semantic token integration', () => {
  let semanticTokensSetting: boolean | undefined;

  suiteSetup(async () => {
    await ensureExtensionActive();
    const config = vscode.workspace.getConfiguration('tcl.features');
    semanticTokensSetting = config.get<boolean>('semanticTokens');
    await config.update('semanticTokens', true, vscode.ConfigurationTarget.Global);
    await sleep(1000);
  });

  suiteTeardown(async () => {
    const config = vscode.workspace.getConfiguration('tcl.features');
    if (typeof semanticTokensSetting === 'boolean') {
      await config.update('semanticTokens', semanticTokensSetting, vscode.ConfigurationTarget.Global);
    }
    await closeAllEditors();
  });

  test('keeps semantic tokens stable when the same Tcl snippet is prefixed with blank lines', async () => {
    const baseContent = [
      'namespace eval ::foo {',
      '  dict set state key value',
      '  dict get $state key',
      '  set x 1',
      '}',
      '',
      'proc bar {args} {',
      '  dict for {k v} $args {',
      '    puts "$k=$v"',
      '  }',
      '}',
    ].join('\n');
    const contentWithLeadingBlankLines = `\n\n${baseContent}`;

    const baselineDoc = await openTemporaryDocument(baseContent);
    const variantDoc = await openTemporaryDocument(contentWithLeadingBlankLines);

    const baselineTokens = await getSemanticTokenSummary(baselineDoc);
    const variantTokens = await getSemanticTokenSummary(variantDoc);

    const relevantBaseline = baselineTokens.filter(token => ['dictCommand', 'dictSubcommand', 'dictKey', 'dictValue'].includes(token.type));
    const relevantVariant = variantTokens
      .filter(token => ['dictCommand', 'dictSubcommand', 'dictKey', 'dictValue'].includes(token.type))
      .map(token => ({ ...token, line: token.line - 2 }));

    const baselineSignature = relevantBaseline.map(token => `${token.line}:${token.startCharacter}:${token.length}:${token.type}:${token.text}`).join('|');
    const variantSignature = relevantVariant.map(token => `${token.line}:${token.startCharacter}:${token.length}:${token.type}:${token.text}`).join('|');

    assert.strictEqual(variantSignature, baselineSignature, 'Leading blank lines should not change the semantic token signature for the same Tcl content');
  });
});
