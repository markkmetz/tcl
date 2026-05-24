# Changelog

## 1.4.6-pre.0

This pre-release includes the following updates:

- Default syntax checking now uses the lightweight brace/bracket/quote checker while you type.
- Local `tclsh` syntax checking is still available, with a one-time warning that it runs unsandboxed.
- Namespace completions preserve a leading `::` when inserting global namespace prefixes.
- Hover, definition, and reference lookups now prefer the current file before imported and workspace matches.
- TclOO method references are counted correctly in usage counts.
- The semantic highlighting suite now covers more mixed token scenarios to catch overlap regressions.

## 1.4.5

- Initial release notes were not previously tracked in this repository.