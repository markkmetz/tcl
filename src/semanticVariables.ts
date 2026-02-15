export interface VariableReferenceSpan {
  start: number;
  length: number;
}

const variablePattern = /\$(?:::[A-Za-z_][A-Za-z0-9_:.]*|[A-Za-z_][A-Za-z0-9_:.]*)/g;

const isEscaped = (lineText: string, index: number): boolean => {
  let slashCount = 0;
  let cursor = index - 1;

  while (cursor >= 0 && lineText[cursor] === '\\') {
    slashCount += 1;
    cursor -= 1;
  }

  return slashCount % 2 === 1;
};

export function extractVariableReferenceSpans(lineText: string): VariableReferenceSpan[] {
  const spans: VariableReferenceSpan[] = [];
  let match: RegExpExecArray | null;

  while ((match = variablePattern.exec(lineText)) !== null) {
    const start = match.index ?? 0;
    if (isEscaped(lineText, start)) continue;

    const text = match[0] ?? '';
    if (!text.length) continue;

    spans.push({ start, length: text.length });
  }

  return spans;
}
