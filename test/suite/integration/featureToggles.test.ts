import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, ensureExtensionActive, sleep } from './helpers';

const FEATURE_SETTINGS = [
  'gotoDefinition',
  'hover',
  'completion',
  'signatureHelp',
  'snippets',
  'semanticTokens',
  'codeLens',
] as const;

type FeatureSetting = typeof FEATURE_SETTINGS[number];

interface FeatureResults {
  definitions: (vscode.Location | vscode.LocationLink)[];
  references: vscode.Location[];
  hovers: vscode.Hover[];
  completions: vscode.CompletionList;
  snippets: vscode.CompletionItem[];
  signatures: vscode.SignatureHelp | undefined;
  semanticTokens: vscode.SemanticTokens | undefined;
  codeLenses: vscode.CodeLens[];
}

suite('Feature toggle integration', () => {
  let originalSettings: Partial<Record<FeatureSetting, boolean>>;
  let doc: vscode.TextDocument;

  suiteSetup(async () => {
    await ensureExtensionActive();
    const config = vscode.workspace.getConfiguration('tcl.features');
    originalSettings = {};
    for (const setting of FEATURE_SETTINGS) {
      originalSettings[setting] = config.get<boolean>(setting);
      await config.update(setting, true, vscode.ConfigurationTarget.Global);
    }

    doc = await vscode.workspace.openTextDocument({
      language: 'tcl',
      content: [
        'proc toggleFeatureProc {arg} {}',
        'toggleFeatureProc(',
        'set completionCursor ',
      ].join('\n'),
    });
    await vscode.window.showTextDocument(doc);
    await sleep(2000);
  });

  suiteTeardown(async () => {
    const config = vscode.workspace.getConfiguration('tcl.features');
    for (const setting of FEATURE_SETTINGS) {
      await config.update(setting, originalSettings[setting], vscode.ConfigurationTarget.Global);
    }
    await closeAllEditors();
  });

  async function readFeatureResults(): Promise<FeatureResults> {
    const procName = 'toggleFeatureProc';
    const definitionPosition = new vscode.Position(1, procName.length / 2);
    const hoverPosition = new vscode.Position(1, procName.length / 2);
    const signaturePosition = new vscode.Position(1, doc.lineAt(1).text.length);
    const completionPosition = new vscode.Position(2, doc.lineAt(2).text.length);
    const completionList = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      completionPosition
    );

    return {
      definitions: (await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        definitionPosition
      )) ?? [],
      references: (await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        doc.uri,
        definitionPosition,
        { includeDeclaration: true }
      )) ?? [],
      hovers: (await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        doc.uri,
        hoverPosition
      )) ?? [],
      completions: completionList,
      snippets: completionList.items.filter(item =>
        item.kind === vscode.CompletionItemKind.Snippet && item.detail === 'Tcl snippet'
      ),
      signatures: await vscode.commands.executeCommand<vscode.SignatureHelp>(
        'vscode.executeSignatureHelpProvider',
        doc.uri,
        signaturePosition
      ),
      semanticTokens: await vscode.commands.executeCommand<vscode.SemanticTokens>(
        'vscode.executeDocumentSemanticTokensProvider',
        doc.uri
      ),
      codeLenses: (await vscode.commands.executeCommand<vscode.CodeLens[]>(
        'vscode.executeCodeLensProvider',
        doc.uri
      )) ?? [],
    };
  }

  async function verifyDisabled(setting: FeatureSetting): Promise<void> {
    const config = vscode.workspace.getConfiguration('tcl.features');
    await config.update(setting, false, vscode.ConfigurationTarget.Global);
    await sleep(300);

    try {
      const results = await readFeatureResults();
      const disabled = (feature: FeatureSetting): boolean => {
        switch (feature) {
          case 'gotoDefinition':
            return results.definitions.length === 0 && results.references.length === 0;
          case 'hover':
            return results.hovers.length === 0;
          case 'completion':
            return results.completions.items.length === 0;
          case 'snippets':
            return results.snippets.length === 0;
          case 'signatureHelp':
            return !results.signatures || results.signatures.signatures.length === 0;
          case 'semanticTokens':
            return !results.semanticTokens || results.semanticTokens.data.length === 0;
          case 'codeLens':
            return results.codeLenses.length === 0;
        }
      };
      const active = (feature: FeatureSetting): boolean => {
        switch (feature) {
          case 'gotoDefinition':
            return results.definitions.length > 0 && results.references.length > 0;
          case 'hover':
            return results.hovers.length > 0;
          case 'completion':
            return results.completions.items.length > 0;
          case 'snippets':
            return results.snippets.length > 0;
          case 'signatureHelp':
            return !!results.signatures?.signatures.length;
          case 'semanticTokens':
            return !!results.semanticTokens?.data.length;
          case 'codeLens':
            return results.codeLenses.length > 0;
        }
      };

      assert.ok(disabled(setting), `Expected ${setting} to be disabled`);
      for (const otherSetting of FEATURE_SETTINGS) {
        if (otherSetting === setting) continue;
        assert.ok(active(otherSetting), `Expected ${otherSetting} to remain active when ${setting} is disabled`);
      }
    } finally {
      await config.update(setting, true, vscode.ConfigurationTarget.Global);
      await sleep(300);
    }
  }

  for (const setting of FEATURE_SETTINGS) {
    test(`disables ${setting} without affecting the other features`, async () => {
      await verifyDisabled(setting);
    });
  }
});
