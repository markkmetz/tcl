export type SyntaxFixType = 'missing-close-brace' | 'missing-close-bracket' | 'missing-close-quote';

export function classifySyntaxError(message: string): SyntaxFixType | null {
  const text = message.toLowerCase();

  if (/missing close-brace|unmatched open brace/.test(text)) {
    return 'missing-close-brace';
  }

  if (/missing close-bracket/.test(text)) {
    return 'missing-close-bracket';
  }

  if (/extra characters after close-quote|unclosed quote|missing close-quote/.test(text)) {
    return 'missing-close-quote';
  }

  return null;
}

export function fixInsertText(fixType: SyntaxFixType): string {
  if (fixType === 'missing-close-brace') return '}';
  if (fixType === 'missing-close-bracket') return ']';
  return '"';
}

export function fixTitle(fixType: SyntaxFixType): string {
  if (fixType === 'missing-close-brace') return 'Insert missing close brace (})';
  if (fixType === 'missing-close-bracket') return 'Insert missing close bracket (])';
  return 'Insert missing close quote (")';
}
