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

export interface LightweightSyntaxIssue {
  line: number;
  message: string;
  severity: SyntaxSeverity;
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
  let inQuote = false;

  const isEscaped = (line: string, idx: number) => {
    let c = 0;
    for (let k = idx - 1; k >= 0 && line[k] === '\\'; k--) c++;
    return (c % 2) === 1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (let j = 0; j < line.length; j++) {
      const ch = line[j];

      // Comments: if '#' and not inside quote, rest of line is comment
      if (ch === '#' && !inQuote) break;

      // Handle quote toggling (respecting escapes)
      if (ch === '"' && !isEscaped(line, j)) {
        inQuote = !inQuote;
        continue;
      }

      if (inQuote) continue;

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
  let inQuote = false;

  const isEscaped = (line: string, idx: number) => {
    let c = 0;
    for (let k = idx - 1; k >= 0 && line[k] === '\\'; k--) c++;
    return (c % 2) === 1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (let j = 0; j < line.length; j++) {
      const ch = line[j];

      // Comments: if '#' and not inside quote, rest of line is comment
      if (ch === '#' && !inQuote) break;

      // Handle quote toggling (respecting escapes)
      if (ch === '"' && !isEscaped(line, j)) {
        inQuote = !inQuote;
        continue;
      }

      if (inQuote) continue;



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
  let inQuote = false;
  let quoteStartLine = -1;

  const isEscaped = (line: string, idx: number) => {
    let c = 0;
    for (let k = idx - 1; k >= 0 && line[k] === '\\'; k--) c++;
    return (c % 2) === 1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (let j = 0; j < line.length; j++) {
      const ch = line[j];

      // Comments only matter when we're not already inside a quoted string.
      if (ch === '#' && !inQuote) {
        break;
      }

      if (ch === '"' && !isEscaped(line, j)) {
        inQuote = !inQuote;
        if (inQuote && quoteStartLine === -1) {
          quoteStartLine = i;
        } else if (!inQuote) {
          quoteStartLine = -1;
        }
      }
    }
  }

  return inQuote ? (quoteStartLine === -1 ? 0 : quoteStartLine) : -1;
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

export function collectLightweightSyntaxIssues(lines: string[]): LightweightSyntaxIssue[] {
  const issues: LightweightSyntaxIssue[] = [];

  const braceLine = findBraceErrorLine(lines);
  if (braceLine !== -1) {
    issues.push({
      line: braceLine,
      message: 'Possible unmatched brace',
      severity: 'error',
    });
  }

  const bracketLine = findBracketErrorLine(lines);
  if (bracketLine !== -1) {
    issues.push({
      line: bracketLine,
      message: 'Possible unmatched bracket',
      severity: 'error',
    });
  }

  const quoteLine = findQuoteErrorLine(lines);
  if (quoteLine !== -1) {
    issues.push({
      line: quoteLine,
      message: 'Possible unclosed quote',
      severity: 'error',
    });
  }

  // --- Unused variable and proc detection (within current file only) ---
  const varDefs: { raw: string; regex: RegExp; isPattern: boolean; line: number }[] = [];
  const procDefs: { name: string; line: number }[] = [];
  const varUsages = new Set<string>();

  const setDefRe = /\bset\s+([^\s]+)/i;
  const procDefRe = /\bproc\s+([A-Za-z0-9_:]+)\b/i;
  const varUsageRe = /\$(?:\{([^}]+)\}|([A-Za-z_]\w*))/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // proc definitions
    const procMatch = line.match(procDefRe);
    if (procMatch) {
      procDefs.push({ name: procMatch[1], line: i });
    }

    // variable definitions via `set` (simple heuristic)
    const setMatch = line.match(setDefRe);
    if (setMatch) {
      const raw = setMatch[1];
      // Build a regex: treat $var or ${var} inside the name as wildcard
      const wildcardPlaceholder = '<<WILDCARD>>';
      const step1 = raw.replace(/\$\{[^}]+\}|\$[A-Za-z_]\w*/g, wildcardPlaceholder);
      const escaped = step1.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const pattern = '^' + escaped.replace(new RegExp(wildcardPlaceholder, 'g'), '.*') + '$';
      const isPattern = /\$\{[^}]+\}|\$[A-Za-z_]\w*/.test(raw);
      try {
        const regex = new RegExp(pattern);
        varDefs.push({ raw, regex, isPattern, line: i });
      } catch (e) {
        // ignore invalid patterns
      }
    }

    // collect variable usages like $var or ${var}
    let m: RegExpExecArray | null;
    varUsageRe.lastIndex = 0;
    while ((m = varUsageRe.exec(line)) !== null) {
      const name = m[1] || m[2];
      if (!name) continue;
      // ignore complex expressions inside ${...} that contain other $ signs
      if (name.includes('$')) continue;
      // only keep simple literal names (no dots/spaces)
      if (/[^A-Za-z0-9_:]/.test(name)) continue;
      varUsages.add(name);
    }
  }

  // Determine unused variables: for each definition, check usages
  for (const vd of varDefs) {
    let used = false;
    if (vd.isPattern) {
      for (const u of varUsages) {
        if (vd.regex.test(u)) {
          used = true;
          break;
        }
      }
    } else {
      if (varUsages.has(vd.raw)) used = true;
    }

    if (!used) {
      issues.push({
        line: vd.line,
        message: `Possible unused variable: ${vd.raw}`,
        severity: 'warning',
      });
    }
  }

  // Determine unused procs: search for usage of proc name elsewhere in file
  for (const pd of procDefs) {
    let used = false;
    const wordRe = new RegExp('\\b' + pd.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    for (let i = 0; i < lines.length; i++) {
      if (i === pd.line) continue; // skip definition
      if (wordRe.test(lines[i])) { used = true; break; }
    }
    if (!used) {
      issues.push({ line: pd.line, message: `Possible unused proc: ${pd.name}`, severity: 'warning' });
    }
  }

  return issues;
}
