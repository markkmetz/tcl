import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runTests } from '@vscode/test-electron';

async function main() {
  // Compiled to out/test/runTests.js — __dirname is <root>/out/test
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  const workspaceFixtures = process.env.TEST_WORKSPACE_PATH
    ? path.resolve(process.env.TEST_WORKSPACE_PATH)
    : path.resolve(__dirname, '../../test/fixtures');
  const isolatedUserDataPath = process.env.TEST_WORKSPACE_PATH
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'tcl-vscode-test-'))
    : undefined;

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspaceFixtures,
        '--disable-extensions',
        '--disable-workspace-trust',
        ...(isolatedUserDataPath ? [`--user-data-dir=${isolatedUserDataPath}`] : []),
      ],
    });
  } catch (err) {
    console.error('Failed to run integration tests:', err);
    process.exitCode = 1;
  } finally {
    if (isolatedUserDataPath) {
      fs.rmSync(isolatedUserDataPath, { recursive: true, force: true });
    }
  }
}

main();
