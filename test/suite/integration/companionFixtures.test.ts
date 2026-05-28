import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  collectDiagnosticSignatures,
  countSignatureTransitions,
  ensureExtensionActive,
  openFixture,
  restoreRuntimeConfig,
  setLightweightRuntimeConfig,
  waitForDiagnosticStability,
  type LightweightRuntimeConfigSnapshot,
} from './helpers';

const companionFixtures = [
  'builtins.tcl',
  'completion-provider.tcl',
  'completion-utils.tcl',
  'diagnostics-collection.tcl',
  'dict-commands.tcl',
  'dicts.tcl',
  'grammar-highlighting.tcl',
  'indexer.tcl',
  'namespace-resolution.tcl',
  'parameter-utils.tcl',
  'reference-utils.tcl',
  'semantic-dict-tokens.tcl',
  'semantic-overlap.tcl',
  'semantic-provider.tcl',
  'semantic-variables.tcl',
  'suppression.tcl',
  'syntax-checker.tcl',
  'syntax-code-action-provider.tcl',
  'syntax-quick-fixes.tcl',
  'unused.tcl',
];

const fixturesExpectedDiagnostics = new Set<string>([
  'diagnostics-collection.tcl',
  'suppression.tcl',
  'syntax-code-action-provider.tcl',
  'syntax-quick-fixes.tcl',
  'unused.tcl',
]);

const expectedSeverityCounts: Record<string, { errors: number; warnings: number }> = {
  'builtins.tcl': { errors: 0, warnings: 0 },
  'completion-provider.tcl': { errors: 0, warnings: 2 },
  'completion-utils.tcl': { errors: 0, warnings: 0 },
  'diagnostics-collection.tcl': { errors: 1, warnings: 3 },
  'dict-commands.tcl': { errors: 0, warnings: 0 },
  'dicts.tcl': { errors: 0, warnings: 0 },
  'grammar-highlighting.tcl': { errors: 0, warnings: 4 },
  'indexer.tcl': { errors: 0, warnings: 0 },
  'namespace-resolution.tcl': { errors: 0, warnings: 0 },
  'parameter-utils.tcl': { errors: 0, warnings: 0 },
  'reference-utils.tcl': { errors: 0, warnings: 1 },
  'semantic-dict-tokens.tcl': { errors: 0, warnings: 0 },
  'semantic-overlap.tcl': { errors: 0, warnings: 1 },
  'semantic-provider.tcl': { errors: 0, warnings: 0 },
  'semantic-variables.tcl': { errors: 0, warnings: 0 },
  'suppression.tcl': { errors: 1, warnings: 0 },
  'syntax-checker.tcl': { errors: 0, warnings: 0 },
  'syntax-code-action-provider.tcl': { errors: 2, warnings: 1 },
  'syntax-quick-fixes.tcl': { errors: 2, warnings: 1 },
  'unused.tcl': { errors: 0, warnings: 3 },
};

const TEST_ROOT = path.resolve(__dirname, '../../../../test');
const UNIT_TEST_ROOT = TEST_ROOT;
const COMPANION_FIXTURE_ROOT = path.resolve(TEST_ROOT, 'fixtures/companion');
const companionHeaderRe = /^#\s*Companion fixture for\s+([^\s]+\.test\.ts)\s*$/i;

function listUnitTests(): string[] {
  return fs.readdirSync(UNIT_TEST_ROOT)
    .filter(name => name.endsWith('.test.ts'))
    .sort();
}

function listCompanionFixtureFiles(): string[] {
  return fs.readdirSync(COMPANION_FIXTURE_ROOT)
    .filter(name => name.endsWith('.tcl'))
    .sort();
}

function fixtureToUnitMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const fixture of listCompanionFixtureFiles()) {
    const fixturePath = path.join(COMPANION_FIXTURE_ROOT, fixture);
    const firstLine = fs.readFileSync(fixturePath, 'utf8').split(/\r?\n/, 1)[0] || '';
    const match = firstLine.match(companionHeaderRe);
    if (match && match[1]) {
      map.set(fixture, match[1]);
    }
  }
  return map;
}

function countSeverities(diagnostics: vscode.Diagnostic[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
      errors += 1;
    } else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
      warnings += 1;
    }
  }
  return { errors, warnings };
}

suite('Companion Fixtures Integration', () => {
  let runtimeSnapshot: LightweightRuntimeConfigSnapshot;

  test('verifies unit test parity with companion fixtures and e2e fixture list', () => {
    const unitTests = listUnitTests();
    const fixtureFiles = listCompanionFixtureFiles();
    const mapping = fixtureToUnitMap();

    const mappedUnitTests = new Set(Array.from(mapping.values()));
    const missingCoverage = unitTests.filter(unit => !mappedUnitTests.has(unit));
    assert.deepStrictEqual(
      missingCoverage,
      [],
      `Unit tests missing companion fixture coverage: ${missingCoverage.join(', ')}`
    );

    const fixtureSet = new Set(fixtureFiles);
    const listedSet = new Set(companionFixtures);
    const unlistedFixtures = fixtureFiles.filter(name => !listedSet.has(name));
    const missingFixtureEntries = companionFixtures.filter(name => !fixtureSet.has(name));

    assert.deepStrictEqual(
      unlistedFixtures,
      [],
      `Companion fixtures not included in e2e fixture list: ${unlistedFixtures.join(', ')}`
    );
    assert.deepStrictEqual(
      missingFixtureEntries,
      [],
      `E2E companion fixture list references missing files: ${missingFixtureEntries.join(', ')}`
    );

    const missingSeverityExpectations = companionFixtures.filter(name => !(name in expectedSeverityCounts));
    assert.deepStrictEqual(
      missingSeverityExpectations,
      [],
      `Missing expected severity counts for fixtures: ${missingSeverityExpectations.join(', ')}`
    );
  });

  suiteSetup(async function () {
    this.timeout(60000);
    await ensureExtensionActive();
    runtimeSnapshot = await setLightweightRuntimeConfig();
  });

  suiteTeardown(async function () {
    this.timeout(60000);
    await restoreRuntimeConfig(runtimeSnapshot);
    await closeAllEditors();
  });

  for (const fixtureName of companionFixtures) {
    test(`opens and stabilizes diagnostics for companion fixture: ${fixtureName}`, async function () {
      this.timeout(30000);

      const { doc } = await openFixture(`companion/${fixtureName}`, 600);
      const diagnostics = await waitForDiagnosticStability(doc.uri, {
        timeoutMs: 9000,
        stableIterations: 3,
        minWaitMs: 1800,
      });

      if (fixturesExpectedDiagnostics.has(fixtureName)) {
        assert.ok(
          diagnostics.length > 0,
          `Expected diagnostics in companion fixture ${fixtureName}`
        );
      }

      const counts = countSeverities(diagnostics);
      assert.deepStrictEqual(
        counts,
        expectedSeverityCounts[fixtureName],
        `Unexpected warning/error count for ${fixtureName}. ` +
          `Expected errors=${expectedSeverityCounts[fixtureName].errors}, warnings=${expectedSeverityCounts[fixtureName].warnings}; ` +
          `received errors=${counts.errors}, warnings=${counts.warnings}`
      );

      const signatures = await collectDiagnosticSignatures(doc.uri, 1200, 150);
      assert.strictEqual(
        countSignatureTransitions(signatures),
        0,
        `Diagnostics changed after stabilization for ${fixtureName}: ${signatures.join(' -> ')}`
      );
    });
  }
});