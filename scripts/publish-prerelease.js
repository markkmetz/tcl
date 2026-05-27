#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const dryRun = process.argv.includes("--dry-run");

function runCommand(command, args, options = {}) {
  const printable = [command].concat(args).join(" ");
  console.log(`\n> ${printable}`);

  if (dryRun && !options.allowInDryRun) {
    console.log("[dry-run] skipped");
    return;
  }

  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return packageJson.version;
}

function computeNextPatchVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/);

  if (!match) {
    throw new Error(`Unsupported semver in package.json: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  return `${major}.${minor}.${patch + 1}`;
}

function main() {
  console.log("Running integration test gate before pre-release publish...");
  runCommand("npm", ["run", "test:integration"], { allowInDryRun: true });

  const currentVersion = getCurrentVersion();
  const nextVersion = computeNextPatchVersion(currentVersion);

  console.log(`Current version: ${currentVersion}`);
  console.log(`Next pre-release version: ${nextVersion}`);

  runCommand("npm", ["version", nextVersion, "--no-git-tag-version"]);
  runCommand("vsce", ["publish", "--pre-release"]);

  console.log("\nPre-release publish flow completed.");
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
