import * as vscode from 'vscode';
import { TclIndexer } from './indexer';

export class TclSemanticProvider implements vscode.DocumentSemanticTokensProvider {
  private indexer: TclIndexer;

  constructor(indexer: TclIndexer) {
    this.indexer = indexer;
  }

  async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
    const builder = new vscode.SemanticTokensBuilder();
    const tokenTypeMap: Record<string, number> = { variable: 0, function: 1, parameter: 2, method: 3 };
    const seenDefs = new Set<string>();

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
    return builder.build();
  }

}
