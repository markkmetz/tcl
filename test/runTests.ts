import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  // Compiled to out/test/runTests.js — __dirname is <root>/out/test
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  const workspaceFixtures = path.resolve(__dirname, '../../test/fixtures');

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspaceFixtures,
        '--disable-extensions',
        '--disable-workspace-trust',
      ],
    });
  } catch (err) {
    console.error('Failed to run integration tests:', err);
    process.exit(1);
  }
}

main();
