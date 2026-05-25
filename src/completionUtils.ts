export function normalizeProcParams(params: string[] = []): string[] {
  const out: string[] = [];
  for (let i = 0; i < params.length; i++) {
    const token = params[i];
    if (token.startsWith('{')) {
      let collected = token;
      while (!collected.endsWith('}') && i + 1 < params.length) {
        i += 1;
        collected += ` ${params[i]}`;
      }
      const inner = collected.replace(/^\{/, '').replace(/\}$/, '').trim();
      if (inner) {
        const name = inner.split(/\s+/)[0];
        if (name) out.push(name);
      }
    } else if (token) {
      out.push(token);
    }
  }
  return out;
}

export function buildProcSnippet(name: string, params?: string[]): string {
  const normalized = normalizeProcParams(params || []);
  if (normalized.length) {
    const placeholders = normalized.map((param, idx) => `\${${idx + 1}:${param}}`).join(' ');
    return `${name} ${placeholders}$0`;
  }
  return `${name}$0`;
}

/**
 * Handler-type keywords used after `on` in a `try` block:
 *   try { ... } on <handler-type> {vars} { ... }
 * These words are also valid Tcl commands, so they need context checking.
 */
const TCL_TRY_HANDLER_TYPES = new Set(['ok', 'error', 'return', 'break', 'continue']);

/**
 * Returns true when the word at `charIndex` in `line` is being used as a Tcl
 * keyword/option argument rather than as a command or variable reference.
 * In those positions hover and go-to-definition should return null.
 *
 * Currently handles:
 *   try { ... } on <handler-type> { ... } — ok, error, return, break, continue
 */
export function isTclKeywordPosition(line: string, charIndex: number): boolean {
  // Locate word boundaries around charIndex
  let start = charIndex;
  while (start > 0 && /[A-Za-z0-9_]/.test(line[start - 1])) { start--; }
  let end = charIndex;
  while (end < line.length && /[A-Za-z0-9_]/.test(line[end])) { end++; }
  const word = line.slice(start, end);

  if (!word) { return false; }

  if (TCL_TRY_HANDLER_TYPES.has(word)) {
    // The text before the word, trimmed of trailing whitespace
    const before = line.slice(0, start).trimEnd();
    if (before.endsWith('on')) {
      // Confirm 'on' is a standalone word (not a suffix like 'json')
      const beforeOn = before.slice(0, before.length - 2);
      if (beforeOn.length === 0 || /\s/.test(beforeOn[beforeOn.length - 1])) {
        return true;
      }
    }
  }

  return false;
}
