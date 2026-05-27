export interface SymbolReference {
  line: number;
  character: number;
  symbol: string;
}

const WORD_CHARS = /[A-Za-z0-9_:.]/;

const isCommandBoundary = (line: string, tokenStart: number): boolean => {
  let cursor = tokenStart - 1;
  while (cursor >= 0 && /\s/.test(line[cursor])) cursor -= 1;
  if (cursor < 0) return true;
  const ch = line[cursor];
  return ch === '[' || ch === ';' || ch === '{';
};

const isDefinitionLineForToken = (line: string, token: string): boolean => {
  const m = line.match(/^\s*(proc|method)\s+([A-Za-z0-9_:.]+)/);
  if (!m || !m[2]) return false;
  const defined = m[2].replace(/^::+/, '');
  const tokenNormalized = token.replace(/^::+/, '');
  const tokenShort = tokenNormalized.split('::').pop() || tokenNormalized;
  const definedShort = defined.split('::').pop() || defined;
  return defined === tokenNormalized || definedShort === tokenShort;
};

const extractWordTokens = (line: string): Array<{ token: string; start: number }> => {
  const out: Array<{ token: string; start: number }> = [];
  let i = 0;
  while (i < line.length) {
    if (!WORD_CHARS.test(line[i])) {
      i += 1;
      continue;
    }
    const start = i;
    i += 1;
    while (i < line.length && WORD_CHARS.test(line[i])) i += 1;
    out.push({ token: line.slice(start, i), start });
  }
  return out;
};

// Symbols that are TclOO methods can be invoked as "$obj method" or "Class method".
// In that pattern the method name is NOT at a command boundary (it follows the object/class
// reference), so we need a secondary position check.
const isMethodCallPosition = (line: string, tokenStart: number): boolean => {
  let cursor = tokenStart - 1;
  // skip whitespace back to the preceding token
  while (cursor >= 0 && /\s/.test(line[cursor])) cursor--;
  if (cursor < 0) return false;
  // walk back to start of the preceding word/token
  const wordEnd = cursor;
  while (cursor >= 0 && /[A-Za-z0-9_$]/.test(line[cursor])) cursor--;
  const precedingToken = line.slice(cursor + 1, wordEnd + 1);
  // If the preceding token is a variable reference (e.g. $obj) it's a method call
  if (precedingToken.startsWith('$')) return true;
  // If the preceding token is itself at a command boundary it could be "ClassName method"
  return isCommandBoundary(line, cursor + 1);
};

export function collectProcMethodReferences(
  lines: string[],
  symbols: string[],
  methodSymbols?: Set<string>
): SymbolReference[] {
  const normalizedSymbols = new Set<string>();
  const symbolShortNames = new Set<string>();

  for (const raw of symbols) {
    const normalized = (raw || '').replace(/^::+/, '');
    if (!normalized) continue;
    normalizedSymbols.add(normalized);
    const short = normalized.split('::').pop() || normalized;
    symbolShortNames.add(short);
  }

  const refs: SymbolReference[] = [];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const trimmed = line.trimStart();
    if (trimmed.startsWith('#')) continue;

    const tokens = extractWordTokens(line);
    for (const tokenInfo of tokens) {
      const { token, start } = tokenInfo;
      const tokenNormalized = token.replace(/^::+/, '');
      const tokenShort = tokenNormalized.split('::').pop() || tokenNormalized;

      const isTarget = normalizedSymbols.has(tokenNormalized) || symbolShortNames.has(tokenShort);
      if (!isTarget) continue;

      // skip variable references like $foo
      if (start > 0 && line[start - 1] === '$') continue;

      // Determine whether this token is a method (looser call-site matching)
      const isMethod = methodSymbols
        ? (methodSymbols.has(tokenNormalized) || methodSymbols.has(tokenShort))
        : false;

      // commands should appear at command boundaries in Tcl;
      // TclOO methods also appear after an object reference ($obj method ...)
      if (!isCommandBoundary(line, start) && !(isMethod && isMethodCallPosition(line, start))) continue;

      // don't count declarations as references
      if (isDefinitionLineForToken(line, tokenNormalized)) continue;

      refs.push({ line: lineNum, character: start, symbol: tokenNormalized });
    }
  }

  const dedupe = new Map<string, SymbolReference>();
  for (const r of refs) {
    dedupe.set(`${r.line}:${r.character}`, r);
  }
  return Array.from(dedupe.values()).sort((a, b) => (a.line - b.line) || (a.character - b.character));
}
