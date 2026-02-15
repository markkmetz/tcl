export type DictSemanticTokenType = 'dictCommand' | 'dictSubcommand' | 'dictKey' | 'dictValue';
export interface DictSemanticTokenSpan {
  start: number;
  length: number;
  type: DictSemanticTokenType;
}

type WordToken = { text: string; start: number; end: number };

const tokenizeWords = (text: string, base = 0): WordToken[] => {
  const tokens: WordToken[] = [];
  let i = 0;

  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i += 1;
    if (i >= text.length) break;

    const start = i;
    let inQuote = false;
    let braceDepth = 0;
    let bracketDepth = 0;
    let escaped = false;

    while (i < text.length) {
      const ch = text[i];

      if (escaped) {
        escaped = false;
        i += 1;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        i += 1;
        continue;
      }

      if (inQuote) {
        if (ch === '"') inQuote = false;
        i += 1;
        continue;
      }

      if (ch === '"') {
        inQuote = true;
        i += 1;
        continue;
      }

      if (ch === '{') {
        braceDepth += 1;
        i += 1;
        continue;
      }
      if (ch === '}' && braceDepth > 0) {
        braceDepth -= 1;
        i += 1;
        continue;
      }

      if (ch === '[') {
        bracketDepth += 1;
        i += 1;
        continue;
      }
      if (ch === ']' && bracketDepth > 0) {
        bracketDepth -= 1;
        i += 1;
        continue;
      }

      if (/\s/.test(ch) && !inQuote && braceDepth === 0 && bracketDepth === 0) break;
      i += 1;
    }

    tokens.push({ text: text.slice(start, i), start: base + start, end: base + i });
  }

  return tokens;
};

const normalizeWrappedToken = (word: string): { text: string; offset: number } => {
  if (word.length >= 2 && ((word.startsWith('{') && word.endsWith('}')) || (word.startsWith('"') && word.endsWith('"')))) {
    return { text: word.slice(1, -1), offset: 1 };
  }
  return { text: word, offset: 0 };
};

const keyWordPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const dictSubcommandPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

const collectBracketExpressionSegments = (lineText: string): Array<{ content: string; offset: number }> => {
  const segments: Array<{ content: string; offset: number }> = [];
  const stack: number[] = [];
  let inQuote = false;
  let escaped = false;

  for (let i = 0; i < lineText.length; i += 1) {
    const ch = lineText[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }

    if (inQuote) continue;

    if (ch === '[') {
      stack.push(i);
      continue;
    }

    if (ch === ']' && stack.length > 0) {
      const start = stack.pop() as number;
      segments.push({ content: lineText.slice(start + 1, i), offset: start + 1 });
    }
  }

  return segments.sort((a, b) => a.offset - b.offset);
};

export function extractDictSemanticTokenSpans(lineText: string): DictSemanticTokenSpan[] {
  const spans: DictSemanticTokenSpan[] = [];

  const pushCommandToken = (start: number, tokenText: string) => {
    if (tokenText !== 'dict') return;
    spans.push({ start, length: tokenText.length, type: 'dictCommand' });
  };

  const pushSubcommandToken = (start: number, tokenText: string) => {
    if (!dictSubcommandPattern.test(tokenText)) return;
    spans.push({ start, length: tokenText.length, type: 'dictSubcommand' });
  };

  const pushKeyToken = (start: number, tokenText: string) => {
    const normalized = normalizeWrappedToken(tokenText);
    if (!keyWordPattern.test(normalized.text)) return;
    spans.push({ start: start + normalized.offset, length: normalized.text.length, type: 'dictKey' });
  };

  const pushValueToken = (start: number, tokenText: string) => {
    const normalized = normalizeWrappedToken(tokenText);
    if (!normalized.text.length) return;
    if (normalized.text.startsWith('[') && normalized.text.endsWith(']')) return;
    spans.push({ start: start + normalized.offset, length: normalized.text.length, type: 'dictValue' });
  };

  const lineTokens = tokenizeWords(lineText);
  let handledDirectDictStructure = false;

  if (lineTokens.length >= 5 && lineTokens[0].text === 'dict' && lineTokens[1].text === 'set') {
    handledDirectDictStructure = true;
    pushCommandToken(lineTokens[0].start, lineTokens[0].text);
    pushSubcommandToken(lineTokens[1].start, lineTokens[1].text);
    for (let i = 3; i < lineTokens.length - 1; i += 1) {
      pushKeyToken(lineTokens[i].start, lineTokens[i].text);
    }
    const valueToken = lineTokens[lineTokens.length - 1];
    pushValueToken(valueToken.start, valueToken.text);
  }

  if (lineTokens.length >= 4 && lineTokens[0].text === 'dict' && lineTokens[1].text === 'create') {
    handledDirectDictStructure = true;
    pushCommandToken(lineTokens[0].start, lineTokens[0].text);
    pushSubcommandToken(lineTokens[1].start, lineTokens[1].text);
    for (let i = 2; i < lineTokens.length; i += 2) {
      pushKeyToken(lineTokens[i].start, lineTokens[i].text);
      if (i + 1 < lineTokens.length) pushValueToken(lineTokens[i + 1].start, lineTokens[i + 1].text);
    }
  }

  if (!handledDirectDictStructure && lineTokens.length >= 2 && lineTokens[0].text === 'dict') {
    pushCommandToken(lineTokens[0].start, lineTokens[0].text);
    pushSubcommandToken(lineTokens[1].start, lineTokens[1].text);
  }

  const bracketSegments = collectBracketExpressionSegments(lineText);
  for (const segment of bracketSegments) {
    const tokens = tokenizeWords(segment.content, segment.offset);
    if (tokens.length < 2 || tokens[0].text !== 'dict') continue;

    pushCommandToken(tokens[0].start, tokens[0].text);
    pushSubcommandToken(tokens[1].start, tokens[1].text);

    if (tokens[1].text === 'create' && tokens.length >= 4) {
      for (let i = 2; i < tokens.length; i += 2) {
        pushKeyToken(tokens[i].start, tokens[i].text);
        if (i + 1 < tokens.length) pushValueToken(tokens[i + 1].start, tokens[i + 1].text);
      }
    }
  }

  return spans.sort((a, b) => a.start - b.start || a.length - b.length);
}
