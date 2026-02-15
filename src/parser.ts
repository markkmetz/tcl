export interface DefinitionParseResult {
  type: 'proc' | 'method';
  name: string;
  params: string[];
}

function extractDictPairs(content: string): Array<{ key: string; value: string; isDict: boolean; dictKeys?: string[] }> {
  const pairs: Array<{ key: string; value: string; isDict: boolean; dictKeys?: string[] }> = [];
  let i = 0;
  
  while (i < content.length) {
    // Skip whitespace
    while (i < content.length && /\s/.test(content[i])) i++;
    if (i >= content.length) break;
    
    // Read key (word characters)
    const keyStart = i;
    while (i < content.length && /[A-Za-z0-9_]/.test(content[i])) i++;
    const key = content.slice(keyStart, i);
    
    if (!key) break;
    
    // Skip whitespace
    while (i < content.length && /\s/.test(content[i])) i++;
    if (i >= content.length) break;
    
    // Read value (could be nested [dict create ...] or simple token)
    const valueStart = i;
    let value = '';
    let isDict = false;
    let dictKeys: string[] = [];
    
    if (content[i] === '[') {
      // Handle [dict create ...] or other bracket expressions
      let bracketDepth = 1;
      i++;
      const bracketContentStart = i;
      
      while (i < content.length && bracketDepth > 0) {
        if (content[i] === '[') bracketDepth++;
        else if (content[i] === ']') bracketDepth--;
        i++;
      }
      
      value = content.slice(valueStart, i);
      
      // Check if it's a dict create
      if (value.includes('dict') && value.includes('create')) {
        isDict = true;
        const nestedMatch = value.match(/\[dict\s+create\s+(.*)\]/);
        if (nestedMatch) {
          const nestedContent = nestedMatch[1];
          const nestedPairs = extractDictPairs(nestedContent);
          dictKeys = nestedPairs.map(p => p.key).filter(k => !k.startsWith('$'));
        }
      }
    } else {
      // Simple value token
      while (i < content.length && !/\s/.test(content[i])) i++;
      value = content.slice(valueStart, i);
    }
    
    pairs.push({ key, value, isDict, dictKeys: dictKeys.length > 0 ? dictKeys : undefined });
  }
  
  return pairs;
}

export function parseDefinitionLine(line: string): DefinitionParseResult | null {
  const m = line.match(/^\s*(proc|method)\s+([A-Za-z0-9_:.]+)\s+\{([^}]*)\}/);
  if (!m) return null;
  const type = m[1] as 'proc' | 'method';
  const name = m[2];
  const paramsRaw = m[3] || '';
  const params = paramsRaw.split(/\s+/).filter(Boolean);
  return { type, name, params };
}

export interface TclScanResult {
  definitions: Array<{ type: 'proc' | 'method'; name: string; params: string[]; fqName: string; normalizedFqName: string; namespace?: string; line: number }>;
  variables: Array<{ name: string; value: string; line: number }>;
  dictOperations: Array<{ varName: string; keys: string[]; line: number; parentDict?: string }>;
  fileNamespaces: Set<string>;
  importedNamespaces: Set<string>;
  importedProcs: Set<string>;
}

export function scanTclLines(lines: string[]): TclScanResult {
  const definitions: TclScanResult['definitions'] = [];
  const variables: TclScanResult['variables'] = [];
  const dictOperations: TclScanResult['dictOperations'] = [];
  const importedNamespaces = new Set<string>();
  const importedProcs = new Set<string>();
  const fileNamespaces = new Set<string>();

  let namespaceStack: string[] = [];
  let namespaceDepths: number[] = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const nsStart = line.match(/^\s*namespace\s+eval\s+([A-Za-z0-9_:]+)\s*\{/);
    if (nsStart) {
      const n = nsStart[1].replace(/^::+/, '');
      namespaceStack.push(n);
      fileNamespaces.add(n);
      namespaceDepths.push(braceDepth + 1);
    }

    let openBraces = 0;
    let closeBraces = 0;
    let inString = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const prev = c > 0 ? line[c - 1] : '';
      if (ch === '"' && prev !== '\\') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') openBraces++;
      else if (ch === '}') closeBraces++;
    }
    braceDepth += openBraces - closeBraces;

    while (namespaceDepths.length > 0 && braceDepth < namespaceDepths[namespaceDepths.length - 1]) {
      namespaceStack.pop();
      namespaceDepths.pop();
    }

    const nsImport = line.match(/^\s*namespace\s+import\s+(.*)$/);
    if (nsImport && nsImport[1]) {
      const parts = nsImport[1].trim().split(/\s+/);
      for (const p of parts) {
        if (p.endsWith('::*')) {
          const ns = p.replace(/::\*+$/, '');
          if (ns) importedNamespaces.add(ns.replace(/^::+/, ''));
        } else if (p.includes('::')) {
          importedProcs.add(p.replace(/^::+/, ''));
        }
      }
    }

    const def = parseDefinitionLine(line);
    if (def) {
      const { type, name, params } = def;
      const hasLeading = /^::+/.test(name);
      const cleanName = name.replace(/^::+/, '');
      let simpleName = cleanName;
      let defNamespace: string | undefined;

      if (cleanName.includes('::')) {
        const parts = cleanName.split('::').filter(Boolean);
        defNamespace = parts.slice(0, -1).join('::');
        simpleName = parts[parts.length - 1];
      } else if (namespaceStack.length) {
        defNamespace = namespaceStack[namespaceStack.length - 1];
      }

      const normalizedFqName = defNamespace ? `${defNamespace}::${simpleName}` : simpleName;
      const fqName = hasLeading ? `::${normalizedFqName}` : normalizedFqName;
      definitions.push({ type, name: simpleName, params, fqName, normalizedFqName, namespace: defNamespace, line: i });
    }

    const vm = line.match(/^\s*set\s+([A-Za-z0-9_:.]+)\s+(.*)$/);
    if (vm && vm[1]) {
      const vname = vm[1];
      const rawValue = vm[2] ? vm[2].trim() : '';
      variables.push({ name: vname, value: rawValue, line: i });

      // Parse dict create patterns: dict create key1 val1 key2 val2
      // Handle multiline dict create with backslash continuation
      let dictValue = rawValue;
      let lineIdx = i;
      while (lineIdx < lines.length - 1 && dictValue.trimEnd().endsWith('\\')) {
        // Remove trailing backslash and continue to next line
        dictValue = dictValue.trimEnd().slice(0, -1) + ' ' + lines[lineIdx + 1];
        lineIdx++;
      }
      
      const dictCreateMatch = dictValue.match(/\[dict\s+create\s+(.*)\]/);
      if (dictCreateMatch && dictCreateMatch[1]) {
        const pairsContent = dictCreateMatch[1];
        const pairs = extractDictPairs(pairsContent);
        const keys: string[] = [];
        
        for (const pair of pairs) {
          if (!pair.key.startsWith('$')) {
            keys.push(pair.key);
            
            // If this pair contains a nested dict, add it as a separate dictOperation
            if (pair.isDict && pair.dictKeys) {
              dictOperations.push({ varName: pair.key, keys: pair.dictKeys, line: i, parentDict: vname });
            }
          }
        }
        
        if (keys.length > 0) {
          dictOperations.push({ varName: vname, keys, line: i });
        }
      }
    }

    // Parse dict set patterns: dict set varname key value
    const dictSetMatch = line.match(/dict\s+set\s+([A-Za-z0-9_:.]+)\s+([A-Za-z0-9_]+)(?:\s|$)/);
    if (dictSetMatch && dictSetMatch[1] && dictSetMatch[2]) {
      const varName = dictSetMatch[1];
      const key = dictSetMatch[2];
      // Check if we already have this dict variable
      const existing = dictOperations.find(d => d.varName === varName);
      if (existing) {
        if (!existing.keys.includes(key)) {
          existing.keys.push(key);
        }
      } else {
        dictOperations.push({ varName, keys: [key], line: i });
      }
    }
  }

  return { definitions, variables, dictOperations, fileNamespaces, importedNamespaces, importedProcs };
}
