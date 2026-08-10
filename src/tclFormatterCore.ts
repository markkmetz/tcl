export interface TclFormattingOptions {
  insertSpaces: boolean;
  tabSize: number;
  lineEnding?: string;
}

export interface TclFormattingError {
  message: string;
  line: number;
  column: number;
}

export interface TclFormattingResult {
  formattedText: string;
  error?: TclFormattingError;
}

type TclContext = 'brace' | 'bracket' | 'quote';

interface LineScanResult {
  indentDepth: number;
  nextStack: TclContext[];
  preserveRaw: boolean;
  error?: TclFormattingError;
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t';
}

function normalizeTabSize(tabSize: number): number {
  if (!Number.isFinite(tabSize) || tabSize < 1) {
    return 2;
  }

  return Math.floor(tabSize);
}

function indentUnit(options: TclFormattingOptions): string {
  const size = normalizeTabSize(options.tabSize);
  return options.insertSpaces ? ' '.repeat(size) : '\t';
}

function formatError(message: string, line: number, column: number): TclFormattingError {
  return { message, line, column };
}

function scanLine(line: string, startStack: TclContext[], lineNumber: number): LineScanResult {
  const nextStack = startStack.slice();
  let indentDepth = nextStack.length;
  let preserveRaw = nextStack[nextStack.length - 1] === 'quote';
  let atCommandStart = true;
  let escaped = false;
  let prefixPhase = true;

  for (let index = 0; index < line.length; index++) {
    const ch = line[index];
    const top = nextStack[nextStack.length - 1];

    if (top === 'quote') {
      if (ch === '\\' && !escaped) {
        escaped = true;
        continue;
      }

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '"') {
        nextStack.pop();
        continue;
      }

      continue;
    }

    if (top === 'brace') {
      if (isWhitespace(ch)) {
        continue;
      }

      if (ch === ';') {
        atCommandStart = true;
        continue;
      }

      if (prefixPhase && atCommandStart && ch === '#') {
        preserveRaw = true;
        break;
      }

      if (ch === '{') {
        nextStack.push('brace');
        prefixPhase = false;
        atCommandStart = false;
        continue;
      }

      if (ch === '}') {
        nextStack.pop();
        if (prefixPhase) {
          indentDepth = Math.max(0, indentDepth - 1);
        }
        prefixPhase = false;
        atCommandStart = false;
        continue;
      }

      if (ch === '[') {
        nextStack.push('bracket');
        prefixPhase = false;
        atCommandStart = false;
        continue;
      }

      if (ch === ']') {
        return {
          indentDepth,
          nextStack,
          preserveRaw,
          error: formatError(`Unexpected closing bracket '${ch}'`, lineNumber, index + 1),
        };
      }

      prefixPhase = false;
      atCommandStart = false;
      continue;
    }

    if (top === 'bracket') {
      if (isWhitespace(ch)) {
        continue;
      }

      if (ch === ';') {
        atCommandStart = true;
        continue;
      }

      if (prefixPhase && atCommandStart && ch === '#') {
        preserveRaw = true;
        break;
      }

      if (ch === '[') {
        nextStack.push('bracket');
        prefixPhase = false;
        atCommandStart = false;
        continue;
      }

      if (ch === ']') {
        nextStack.pop();
        if (prefixPhase) {
          indentDepth = Math.max(0, indentDepth - 1);
        }
        prefixPhase = false;
        atCommandStart = false;
        continue;
      }

      if (ch === '{') {
        nextStack.push('brace');
        prefixPhase = false;
        atCommandStart = false;
        continue;
      }

      if (ch === '}') {
        return {
          indentDepth,
          nextStack,
          preserveRaw,
          error: formatError(`Unexpected closing bracket '${ch}'`, lineNumber, index + 1),
        };
      }

      prefixPhase = false;
      atCommandStart = false;
      continue;
    }

    if (isWhitespace(ch)) {
      continue;
    }

    if (ch === ';') {
      atCommandStart = true;
      continue;
    }

    if (prefixPhase && atCommandStart && ch === '#') {
      preserveRaw = true;
      break;
    }

    if (ch === '{') {
      nextStack.push('brace');
      prefixPhase = false;
      atCommandStart = false;
      continue;
    }

    if (ch === '[') {
      nextStack.push('bracket');
      prefixPhase = false;
      atCommandStart = false;
      continue;
    }

    if (ch === '"') {
      nextStack.push('quote');
      prefixPhase = false;
      atCommandStart = false;
      escaped = false;
      continue;
    }

    if (ch === '}') {
      return {
        indentDepth,
        nextStack,
        preserveRaw,
        error: formatError(`Unexpected closing bracket '${ch}'`, lineNumber, index + 1),
      };
    }

    if (ch === ']') {
      return {
        indentDepth,
        nextStack,
        preserveRaw,
        error: formatError(`Unexpected closing bracket '${ch}'`, lineNumber, index + 1),
      };
    }

    prefixPhase = false;
    atCommandStart = false;
  }

  return { indentDepth, nextStack, preserveRaw };
}

export function formatTclText(text: string, options: TclFormattingOptions): TclFormattingResult {
  const lineEnding = options.lineEnding ?? '\n';
  const lines = text.split(/\r?\n/);
  const output: string[] = [];
  let stack: TclContext[] = [];
  const unit = indentUnit(options);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    if (line.length === 0) {
      output.push('');
      continue;
    }

    const scan = scanLine(line, stack, lineIndex + 1);
    if (scan.error) {
      return { formattedText: text, error: scan.error };
    }

    const content = scan.preserveRaw ? line : line.replace(/^[\t ]*/, '');
    output.push(scan.preserveRaw ? line : `${unit.repeat(scan.indentDepth)}${content}`);
    stack = scan.nextStack;
  }

  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    const label = top === 'quote' ? 'quoted string' : top === 'brace' ? 'brace block' : 'bracket block';
    return {
      formattedText: text,
      error: formatError(`Cannot format Tcl document because there is an unclosed ${label}.`, lines.length, 1),
    };
  }

  return { formattedText: output.join(lineEnding) };
}