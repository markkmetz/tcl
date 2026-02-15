import * as vscode from 'vscode';
import { TclIndexer } from './indexer';

export class TclSemanticProvider implements vscode.DocumentSemanticTokensProvider {
  private indexer: TclIndexer;

  constructor(indexer: TclIndexer) {
    this.indexer = indexer;
  }

  async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
    const builder = new vscode.SemanticTokensBuilder();
    const tokenTypeMap: Record<string, number> = { variable: 0, function: 1, parameter: 2, method: 3, dictKey: 4 };
    const seenDefs = new Set<string>();

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

    const normalizeKeyToken = (word: string): string => {
      if (word.startsWith('{') && word.endsWith('}') && word.length >= 2) return word.slice(1, -1);
      if (word.startsWith('"') && word.endsWith('"') && word.length >= 2) return word.slice(1, -1);
      return word;
    };

    const keyWordPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

    const pushDictKey = (line: number, start: number, tokenText: string) => {
      const normalized = normalizeKeyToken(tokenText);
      if (!keyWordPattern.test(normalized)) return;

      let keyStart = start;
      if ((tokenText.startsWith('{') && tokenText.endsWith('}')) || (tokenText.startsWith('"') && tokenText.endsWith('"'))) {
        keyStart += 1;
      }

      builder.push(line, keyStart, normalized.length, tokenTypeMap['dictKey'], 0);
    };

    const highlightDictKeysOnLine = (lineNumber: number, lineText: string) => {
      const tokens = tokenizeWords(lineText);
      if (tokens.length < 4) return;

      if (tokens[0].text === 'dict' && tokens[1].text === 'set' && tokens.length >= 5) {
        for (let i = 3; i < tokens.length - 1; i += 1) {
          pushDictKey(lineNumber, tokens[i].start, tokens[i].text);
        }
      }

      if (tokens[0].text === 'dict' && tokens[1].text === 'create' && tokens.length >= 4) {
        for (let i = 2; i < tokens.length; i += 2) {
          pushDictKey(lineNumber, tokens[i].start, tokens[i].text);
        }
      }

      const inlineCreateRegex = /\[dict\s+create\s+([^\]]+)\]/g;
      let match: RegExpExecArray | null;
      while ((match = inlineCreateRegex.exec(lineText)) !== null) {
        if (!match[1]) continue;
        const content = match[1];
        const contentOffset = (match.index ?? 0) + match[0].indexOf(content);
        const innerTokens = tokenizeWords(content, contentOffset);

        for (let i = 0; i < innerTokens.length; i += 2) {
          pushDictKey(lineNumber, innerTokens[i].start, innerTokens[i].text);
        }
      }
    };

    const getNameSpan = (lineText: string, startCol: number, fallbackName: string) => {
      const slice = lineText.slice(startCol);
      const m = slice.match(/^[A-Za-z0-9_:.]+/);
      if (m) return { name: m[0], length: m[0].length };
      return { name: fallbackName, length: fallbackName.length };
    };

    const findDefinitionNameSpan = (lineText: string, fallbackCol: number, fallbackName: string) => {
      const defMatch = lineText.match(/^\s*(proc|method)\s+([A-Za-z0-9_:.]+)/);
      if (defMatch && defMatch[2]) {
        const name = defMatch[2];
        const col = lineText.indexOf(name, defMatch.index ?? 0);
        return { col: col >= 0 ? col : fallbackCol, name, length: name.length };
      }
      const span = getNameSpan(lineText, fallbackCol, fallbackName);
      return { col: fallbackCol, name: span.name, length: span.length };
    };

    const extractParamsBlock = (startLine: number, startCol: number, nameLen: number) => {
      let line = startLine;
      let col = startCol + nameLen;
      let foundStart = false;
      let depth = 0;
      let paramsText = '';
      const positions: Array<{ line: number; char: number }> = [];

      while (line < document.lineCount) {
        const text = document.lineAt(line).text;
        let i = Math.max(0, col);
        while (i < text.length) {
          const ch = text[i];

          if (!foundStart) {
            if (ch === '{') {
              foundStart = true;
              depth = 1;
            }
            i += 1;
            continue;
          }

          if (ch === '{') depth += 1;
          if (ch === '}') depth -= 1;

          if (depth === 0) {
            return { paramsText, positions };
          }

          paramsText += ch;
          positions.push({ line, char: i });
          i += 1;
        }

        if (foundStart) {
          paramsText += '\n';
          positions.push({ line, char: text.length });
        }

        line += 1;
        col = 0;
      }

      return { paramsText, positions };
    };

    const parseParamsWithPositions = (paramsText: string, positions: Array<{ line: number; char: number }>, fallbackLine: number, fallbackChar: number) => {
      const results: Array<{ name: string; posIndex: number }> = [];
      let current = '';
      let currentStart = -1;
      let depth = 0;

      for (let i = 0; i < paramsText.length; i++) {
        const ch = paramsText[i];
        const isWs = /\s/.test(ch);

        if (isWs && depth === 0) {
          if (current.length) {
            const token = current;
            const tokenStart = currentStart;
            if (token.startsWith('{')) {
              const inner = token.slice(1).trim();
              const innerName = inner.split(/\s+/)[0] || '';
              if (innerName) results.push({ name: innerName, posIndex: tokenStart + 1 });
            } else {
              results.push({ name: token, posIndex: tokenStart });
            }
            current = '';
            currentStart = -1;
          }
          continue;
        }

        if (currentStart === -1) currentStart = i;
        current += ch;
        if (ch === '{') depth += 1;
        if (ch === '}') depth = Math.max(0, depth - 1);
      }

      if (current.length) {
        const token = current;
        const tokenStart = currentStart;
        if (token.startsWith('{')) {
          const inner = token.slice(1).trim();
          const innerName = inner.split(/\s+/)[0] || '';
          if (innerName) results.push({ name: innerName, posIndex: tokenStart + 1 });
        } else {
          results.push({ name: token, posIndex: tokenStart });
        }
      }

      return results.map(r => ({
        name: r.name,
        position: positions[r.posIndex] || { line: fallbackLine, char: fallbackChar }
      }));
    };

    // highlight proc and method names and their parameters (only definitions in this document)
    const sigs = this.indexer.getDocumentSignatures(document);
    for (const s of sigs) {
      const line = s.loc.range.start.line;
      const lineText = document.lineAt(line).text;

      // find definition name span (handles leading :: in names)
      const fallbackCol = s.loc.range.start.character;
      const defSpan = findDefinitionNameSpan(lineText, fallbackCol, s.fqName);

      const tokenTypeIndex = s.type === 'method' ? tokenTypeMap['method'] : tokenTypeMap['function'];
      const defKey = `${line}:${defSpan.col}:${defSpan.length}`;
      if (!seenDefs.has(defKey)) {
        builder.push(line, defSpan.col, defSpan.length, tokenTypeIndex, 0);
        seenDefs.add(defKey);
      }

      const { paramsText, positions } = extractParamsBlock(line, defSpan.col, defSpan.length);
      if (paramsText && positions.length) {
        const parsed = parseParamsWithPositions(paramsText, positions, line, defSpan.col);
        for (const p of parsed) {
          if (!p.name) continue;
          builder.push(p.position.line, p.position.char, p.name.length, tokenTypeMap['parameter'], 0);
        }
      }
    }

    // fallback: scan document lines for proc/method definitions not in index
    for (let line = 0; line < document.lineCount; line++) {
      const lineText = document.lineAt(line).text;
      const defMatch = lineText.match(/^\s*(proc|method)\s+([A-Za-z0-9_:.]+)/);
      if (!defMatch) continue;

      const type = defMatch[1] === 'method' ? 'method' : 'proc';
      const name = defMatch[2];
      const col = lineText.indexOf(name, defMatch.index ?? 0);
      if (col < 0) continue;

      const defKey = `${line}:${col}:${name.length}`;
      if (seenDefs.has(defKey)) continue;

      const tokenTypeIndex = type === 'method' ? tokenTypeMap['method'] : tokenTypeMap['function'];
      builder.push(line, col, name.length, tokenTypeIndex, 0);
      seenDefs.add(defKey);

      const { paramsText, positions } = extractParamsBlock(line, col, name.length);
      if (paramsText && positions.length) {
        const parsed = parseParamsWithPositions(paramsText, positions, line, col);
        for (const p of parsed) {
          if (!p.name) continue;
          builder.push(p.position.line, p.position.char, p.name.length, tokenTypeMap['parameter'], 0);
        }
      }
    }

    // highlight variable declarations
    const vars = this.indexer.listVariables();
    for (const v of vars) {
      const line = v.loc.range.start.line;
      const col = v.loc.range.start.character;
      builder.push(line, col, v.name.length, tokenTypeMap['variable'], 0);
    }

    // highlight dictionary keys in common dict set/create forms
    for (let line = 0; line < document.lineCount; line++) {
      highlightDictKeysOnLine(line, document.lineAt(line).text);
    }

    return builder.build();
  }

}
