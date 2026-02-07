# Tcl Go To Definition

Simple VS Code extension that provides Go To Definition (F12) for Tcl `proc` definitions across the workspace.

Usage
- Open a Tcl file in VS Code (language id `tcl`).
- Press F12 on a proc usage to jump to its definition.

Notes
- This implements a lightweight workspace indexer looking for `proc <name>` lines. It is intentionally simple and can be extended to support namespaces, sources, or more advanced parsing.
