# Mark's TCL extension

Simple VS Code extension that provides Go To Definition (F12) for Tcl `proc` definitions and several editor conveniences for Tcl files.

Features
- Go To Definition (F12) for `proc` and `method` definitions across indexed folders
- Hover preview for variables and procedures (shows definitions and values)
- Completion suggestions for indexed procedures and common built-in commands
- Snippets for common constructs (`proc`, `namespace`)
- Signature help for procedures
- Semantic tokens and basic lint diagnostics
- Optional: index additional external folders containing Tcl files

Quick Usage
- Open a Tcl file (file extension `.tcl`) in VS Code.
- Press `F12` on a proc/method call to jump to its definition.
- Start typing a command or proc name to see completions and snippets.

Settings
- `tcl.features.gotoDefinition` (boolean, default `true`) — enable/disable Go To Definition
- `tcl.features.hover` (boolean, default `true`) — enable/disable hover previews
- `tcl.features.completion` (boolean, default `true`) — enable/disable completions
- `tcl.features.signatureHelp` (boolean, default `true`) — enable/disable signature help
- `tcl.features.semanticTokens` (boolean, default `true`) — enable/disable semantic highlighting
- `tcl.features.lint` (boolean, default `true`) — enable/disable lint diagnostics
- `tcl.index.externalPaths` (string[], default `[]`) — absolute filesystem folder paths to include when indexing Tcl files

Notes
- The indexer is intentionally lightweight and parses simple single-line `proc`/`method` definitions and `set` assignments. You can extend the indexer to follow `source` commands or parse multi-line definitions.
- `proc` and `namespace` are provided as editable snippets (available in completions).

Development
- Build: `npm run compile`
- Run tests: `npm test`
# Tcl Go To Definition

Simple VS Code extension that provides Go To Definition (F12) for Tcl `proc` definitions across the workspace.

Usage
- Open a Tcl file in VS Code (language id `tcl`).
- Press F12 on a proc usage to jump to its definition.

Notes
- This implements a lightweight workspace indexer looking for `proc <name>` lines. It is intentionally simple and can be extended to support namespaces, sources, or more advanced parsing.
