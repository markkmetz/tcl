# Mark's TCL extension

> **Deprecated:** This extension is no longer maintained.
>
> Please switch to one of these alternatives instead:
> - Tcl/Tk
> - iRules
> - EDA Tools
> - Expect LSP/MSP by Bite Wise Cook

A simple VS Code extension for Tcl that makes day-to-day editing easier.

## What it does

- Go To Definition (`F12`) for `proc` and `method`
- Hover info for variables and procedures
- Completions + snippets for common Tcl patterns
- Signature help while typing calls
- Semantic highlighting for:
	- variables like `$name`
	- dict command parts (`dict`, `create`, `get`, etc.)
	- dict keys and values (with different token types)
- Syntax checking (local `tclsh` or remote service)
- Quick Fix suggestions for common syntax issues (missing `}`, `]`, or `"`)

## Quick start

1. Open any `.tcl` file in VS Code.
2. Use `F12` on a proc/method call.
3. Try typing and use completion/signature help.
4. If syntax errors show up, use Quick Fix (`Cmd+.`) for suggested fixes.

## Settings

- `tcl.features.gotoDefinition`
- `tcl.features.hover`
- `tcl.features.completion`
- `tcl.features.signatureHelp`
- `tcl.features.semanticTokens`
- `tcl.features.lint`
- `tcl.index.externalPaths`
- `tcl.runtime.syntaxCheckMode` (`lightweight`, `local`, `remote`)
- `tcl.runtime.tclshPath`
- `tcl.runtime.remoteUrl`
- `tcl.runtime.syntaxCheckDelay`

## Dev

- Build: `npm run compile`
- Test: `npm test`

## Pre-release publish

- Dry-run the flow: `npm run publish:prerelease -- --dry-run`
- Publish pre-release to VS Code Marketplace: `npm run publish:prerelease`

This script does the following in order:

1. Runs integration tests (`npm run test:integration`)
2. Bumps version by one patch (for example `1.4.8` -> `1.4.9`)
3. Publishes with `vsce publish --pre-release`

Notes:

- It does not create a git tag (`--no-git-tag-version`)
- It is pre-release only and does not perform a stable release
