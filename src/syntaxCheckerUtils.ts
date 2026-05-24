export type SyntaxSeverity = 'error' | 'warning';

export interface SyntaxErrorFrame {
  filePath?: string;
  line: number;
}

export interface ParsedSyntaxError {
  message: string;
  fallbackLine: number;
  frames: SyntaxErrorFrame[];
}

function normalizePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/').toLowerCase();
}

export function buildSyntaxInitScript(sourceFiles: string[]): string {
  let initScript = '# Auto-generated initialization script\n';
  initScript += '# This sources all project TCL files to provide context for syntax checking\n';

  for (const sourceFile of sourceFiles) {
    const escapedPath = sourceFile.replace(/\\/g, '/');
    initScript += `if {[catch {source "${escapedPath}"} err]} {\n`;
    initScript += '  # Ignore errors during sourcing (file may have syntax errors)\n';
    initScript += '}\n';
  }

  return initScript;
}

export function findBraceErrorLine(lines: string[]): number {
  let depth = 0;
  let lastOpenLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (let j = 0; j < line.length; j++) {
      const ch = line[j];

      // Skip simple quoted spans in a single line
      if (ch === '"') {
        const closeQuote = line.indexOf('"', j + 1);
        if (closeQuote !== -1) {
          j = closeQuote;
          continue;
        }
      }

      if (ch === '{') {
        depth++;
        lastOpenLine = i;
      } else if (ch === '}') {
        depth--;
        if (depth < 0) {
          return i;
        }
      }
    }
  }

  if (depth > 0 && lastOpenLine !== -1) {
    return lastOpenLine;
  }

  return -1;
}

export function findBracketErrorLine(lines: string[]): number {
  let depth = 0;
  let lastOpenLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (let j = 0; j < line.length; j++) {
      const ch = line[j];

      // Skip simple quoted spans in a single line
      if (ch === '"') {
        const closeQuote = line.indexOf('"', j + 1);
        if (closeQuote !== -1) {
          j = closeQuote;
          continue;
        }
      }

      if (ch === '[') {
        depth++;
        lastOpenLine = i;
      } else if (ch === ']') {
        depth--;
        if (depth < 0) {
          return i;
        }
      }
    }
  }

  if (depth > 0 && lastOpenLine !== -1) {
    return lastOpenLine;
  }

  return -1;
}

export function findQuoteErrorLine(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let inQuote = false;

    for (let j = 0; j < line.length; j++) {
      if (line[j] === '"') {
        inQuote = !inQuote;
      }
    }

    if (inQuote) {
      return i;
    }
  }

  return -1;
}

export function classifySyntaxSeverity(message: string): SyntaxSeverity {
  if (/can't read ".*": no such variable/i.test(message)) {
    return 'warning';
  }
  return 'error';
}

export function extractErrorMessageAndLine(errorText: string, lineCount: number): ParsedSyntaxError {
  if (!errorText || errorText.trim().length === 0) {
    return { message: '', fallbackLine: 0, frames: [] };
  }

  const lines = errorText.split(/\r?\n/);
  let message = '';
  let fallbackLine = 0;
  const frames: SyntaxErrorFrame[] = [];
  let foundFallback = false;

  for (const line of lines) {
    const fileLineMatch = line.match(/\(file\s+"([^"]+)"\s+line\s+(\d+)\)/i);
    if (fileLineMatch) {
      const parsedLine = Math.max(0, parseInt(fileLineMatch[2], 10) - 1);
      frames.push({ filePath: fileLineMatch[1], line: parsedLine });
      if (!foundFallback) {
        fallbackLine = Math.max(0, Math.min(parsedLine, Math.max(0, lineCount - 1)));
        foundFallback = true;
      }
      continue;
    }

    const lineMatch = line.match(/line (\d+)/i);
    if (lineMatch) {
      const parsedLine = Math.max(0, parseInt(lineMatch[1], 10) - 1);
      frames.push({ line: parsedLine });
      if (!foundFallback) {
        fallbackLine = Math.max(0, Math.min(parsedLine, Math.max(0, lineCount - 1)));
        foundFallback = true;
      }
    }

    if (line.includes('ERROR:')) {
      message = line.replace(/^.*ERROR:\s*/, '').trim();
    } else if (line.trim().length > 0 && !line.includes('(file ') && !line.startsWith('    ')) {
      message += (message ? ' ' : '') + line.trim();
    }
  }

  return { message, fallbackLine, frames };
}

export function selectPrimaryFrame(
  frames: SyntaxErrorFrame[],
  preferredFilePaths: string[]
): SyntaxErrorFrame | undefined {
  if (!frames.length) {
    return undefined;
  }

  const preferred = new Set(preferredFilePaths.map(normalizePath));
  const matchingPreferred = frames.find(frame => frame.filePath && preferred.has(normalizePath(frame.filePath)));
  if (matchingPreferred) {
    return matchingPreferred;
  }

  const noFileFrame = frames.find(frame => !frame.filePath);
  if (noFileFrame) {
    return noFileFrame;
  }

  return frames[0];
}

export function resolveTargetLine(message: string, fallbackLine: number, lines: string[]): number {
  if (/missing close-brace|unmatched open brace/i.test(message)) {
    const line = findBraceErrorLine(lines);
    return line === -1 ? fallbackLine : line;
  }

  if (/missing close-bracket/i.test(message)) {
    const line = findBracketErrorLine(lines);
    return line === -1 ? fallbackLine : line;
  }

  if (/extra characters after close-quote/i.test(message)) {
    const line = findQuoteErrorLine(lines);
    return line === -1 ? fallbackLine : line;
  }

  return fallbackLine;
}
