export interface DefinitionParseResult {
  type: 'proc' | 'method';
  name: string;
  params: string[];
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
  fileNamespaces: Set<string>;
  importedNamespaces: Set<string>;
  importedProcs: Set<string>;
}

export function scanTclLines(lines: string[]): TclScanResult {
  const definitions: TclScanResult['definitions'] = [];
  const variables: TclScanResult['variables'] = [];
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
    }
  }

  return { definitions, variables, fileNamespaces, importedNamespaces, importedProcs };
}
