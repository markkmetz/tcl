import * as vscode from 'vscode';
import { parseDefinitionLine } from './parser';

export class TclIndexer {
  private index: Map<string, vscode.Location[]> = new Map();
  private variableIndex: Map<string, { loc: vscode.Location; value: string }[]> = new Map();
  private procIndex: Map<string, { loc: vscode.Location; params: string[]; fqName: string; namespace?: string }[]> = new Map();
  private methodIndex: Map<string, { loc: vscode.Location; params: string[]; fqName: string; namespace?: string }[]> = new Map();
  private watcher?: vscode.FileSystemWatcher;
  private externalPaths: string[] = [];
  private externalWatchers: vscode.FileSystemWatcher[] = [];
  private fileImports: Map<string, { fileNamespaces: Set<string>; importedNamespaces: Set<string>; importedProcs: Set<string> }> = new Map();
  private _onDidIndex = new vscode.EventEmitter<void>();
  public readonly onDidIndex = this._onDidIndex.event;

  activate(context: vscode.ExtensionContext) {
    this.buildIndex();
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.tcl');
    this.watcher.onDidCreate(uri => this.indexFile(uri));
    this.watcher.onDidChange(uri => this.indexFile(uri));
    this.watcher.onDidDelete(uri => this.removeFile(uri));
    context.subscriptions.push(this.watcher as vscode.Disposable);

    // read configured external paths and set watchers
    const cfg = vscode.workspace.getConfiguration('tcl');
    const external = cfg.get<string[]>('index.externalPaths') || [];
    if (external && external.length) this.setExternalPaths(external, context);
  }

  async buildIndex() {
    this.index.clear();
    this.variableIndex.clear();
    this.procIndex.clear();
    this.methodIndex.clear();
    this.fileImports.clear();
    const files = await vscode.workspace.findFiles('**/*.tcl');
    const allFiles = [...files];

    // include external paths if configured
    for (const p of this.externalPaths) {
      try {
        const rp = new vscode.RelativePattern(p, '**/*.tcl');
        const extFiles = await vscode.workspace.findFiles(rp);
        allFiles.push(...extFiles);
      } catch (e) {
        // ignore invalid paths
      }
    }

    await Promise.all(allFiles.map(f => this.indexFile(f)));
    this._onDidIndex.fire();
  }

  async setExternalPaths(paths: string[], context?: vscode.ExtensionContext) {
    // dispose old watchers
    for (const w of this.externalWatchers) { w.dispose(); }
    this.externalWatchers = [];
    this.externalPaths = paths || [];

    for (const p of this.externalPaths) {
      try {
        const pattern = `${p.replace(/\\/g, '/')}/**/*.tcl`;
        const w = vscode.workspace.createFileSystemWatcher(pattern);
        w.onDidCreate(uri => this.indexFile(uri));
        w.onDidChange(uri => this.indexFile(uri));
        w.onDidDelete(uri => this.removeFile(uri));
        this.externalWatchers.push(w);
        if (context) context.subscriptions.push(w as vscode.Disposable);
      } catch (e) {
        // ignore watcher creation errors
      }
    }

    // rebuild index to include newly added external files
    await this.buildIndex();
  }

  async indexFile(uri: vscode.Uri) {
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const lines = doc.getText().split(/\r?\n/);

    // track current namespace and imports while scanning file
    const importedNamespaces = new Set<string>();
    const importedProcs = new Set<string>();
    const fileNamespaces = new Set<string>();
    let namespaceStack: string[] = [];
    let namespaceDepths: number[] = []; // track brace depth at which each namespace was entered
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // detect namespace eval start: namespace eval NAME {
      const nsStart = line.match(/^\s*namespace\s+eval\s+([A-Za-z0-9_:]+)\s*\{/);
      if (nsStart) {
        const n = nsStart[1].replace(/^::+/, '');
        namespaceStack.push(n);
        fileNamespaces.add(n);
        namespaceDepths.push(braceDepth + 1); // the depth after the opening brace
      }

      // count braces on this line to track depth
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      // pop namespace if we've returned to the depth before the namespace block
      while (namespaceDepths.length > 0 && braceDepth < namespaceDepths[namespaceDepths.length - 1]) {
        namespaceStack.pop();
        namespaceDepths.pop();
      }

      // detect namespace import statements
      const nsImport = line.match(/^\s*namespace\s+import\s+(.*)$/);
      if (nsImport && nsImport[1]) {
        const parts = nsImport[1].trim().split(/\s+/);
        for (const p of parts) {
          if (p.endsWith('::*')) {
            const ns = p.replace(/::\*+$/, '');
            if (ns) importedNamespaces.add(ns.replace(/^::+/, ''));
          } else if (p.includes('::')) {
            // explicit fq proc import
            importedProcs.add(p.replace(/^::+/, ''));
          }
        }
      }

      // match both 'proc' and 'method'
      const def = parseDefinitionLine(line);
      if (def) {
        const { type, name, params } = def;
        // normalize leading :: in definitions
        const cleanName = name.replace(/^::+/, '');
        // determine namespace for this definition
        let simpleName = cleanName;
        let defNamespace: string | undefined;
        if (cleanName.includes('::')) {
          const parts = cleanName.split('::').filter(Boolean);
          defNamespace = parts.slice(0, -1).join('::');
          simpleName = parts[parts.length - 1];
        } else if (namespaceStack.length) {
          defNamespace = namespaceStack[namespaceStack.length - 1];
        }

        const fqName = defNamespace ? `${defNamespace}::${simpleName}` : simpleName;
        const pos = new vscode.Position(i, line.indexOf(simpleName));
        const loc = new vscode.Location(uri, pos);

        // general index for hover (use simple name and fqName)
        const arr = this.index.get(simpleName) || [];
        const exists = arr.findIndex(l => l.uri.toString() === uri.toString() && l.range.start.line === i);
        if (exists === -1) {
          arr.push(loc);
          this.index.set(simpleName, arr);
        }
        // also index by fqName (normalized) for direct lookup
        if (defNamespace) {
          const normalizedFq = fqName.replace(/^::+/, '');
          const farr = this.index.get(normalizedFq) || [];
          if (!farr.find(l => l.uri.toString() === uri.toString() && l.range.start.line === i)) {
            farr.push(loc);
            this.index.set(normalizedFq, farr);
          }
        }

        // proc/method-specific index (keyed by simple name)
        const indexMap = type === 'proc' ? this.procIndex : this.methodIndex;
        const pArr = indexMap.get(simpleName) || [];
        const pExists = pArr.findIndex(p => p.loc.uri.toString() === uri.toString() && p.loc.range.start.line === i);
        if (pExists === -1) {
          pArr.push({ loc, params, fqName: fqName.replace(/^::+/, ''), namespace: defNamespace });
          indexMap.set(simpleName, pArr);
        }
      }

      // index variable assignments: `set name value`
      const vm = line.match(/^\s*set\s+([A-Za-z0-9_:.]+)\s+(.*)$/);
      if (vm && vm[1]) {
        const vname = vm[1];
        const rawValue = vm[2] ? vm[2].trim() : '';
        const vpos = new vscode.Position(i, line.indexOf(vname));
        const vloc = new vscode.Location(uri, vpos);

        const varArr = this.variableIndex.get(vname) || [];
        const existsVar = varArr.findIndex(v => v.loc.uri.toString() === uri.toString() && v.loc.range.start.line === i);
        if (existsVar === -1) {
          varArr.push({ loc: vloc, value: rawValue });
          this.variableIndex.set(vname, varArr);
        }
      }
    }

    // store imports/namespace info for this file
    const fileKey = uri.toString();
    this.fileImports.set(fileKey, { fileNamespaces, importedNamespaces, importedProcs });
  } catch (e) {
    // ignore unreadable files
  }
  this._onDidIndex.fire();
}

  removeFile(uri: vscode.Uri) {
    for (const [k, arr] of this.index.entries()) {
      const filtered = arr.filter(l => l.uri.toString() !== uri.toString());
      if (filtered.length !== arr.length) {
        if (filtered.length) this.index.set(k, filtered);
        else this.index.delete(k);
      }
    }
    for (const [k, arr] of this.variableIndex.entries()) {
      const filtered = arr.filter(l => l.loc.uri.toString() !== uri.toString());
      if (filtered.length !== arr.length) {
        if (filtered.length) this.variableIndex.set(k, filtered);
        else this.variableIndex.delete(k);
      }
    }
    for (const [k, arr] of this.procIndex.entries()) {
      const filtered = arr.filter(p => p.loc.uri.toString() !== uri.toString());
      if (filtered.length !== arr.length) {
        if (filtered.length) this.procIndex.set(k, filtered);
        else this.procIndex.delete(k);
      }
    }
    for (const [k, arr] of this.methodIndex.entries()) {
      const filtered = arr.filter(p => p.loc.uri.toString() !== uri.toString());
      if (filtered.length !== arr.length) {
        if (filtered.length) this.methodIndex.set(k, filtered);
        else this.methodIndex.delete(k);
      }
    }
    this._onDidIndex.fire();
  }

  // Linting: detect duplicate definitions and unused variables
  async lint(): Promise<Array<{ uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>> {
    const results: Array<{ uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }> = [];

    // duplicate procs/methods
    const checkDuplicates = (map: Map<string, any[]>) => {
      for (const [name, arr] of map.entries()) {
        if (arr.length > 1) {
          for (const entry of arr) {
            const diag = new vscode.Diagnostic(entry.loc.range, `Duplicate definition of '${name}'`, vscode.DiagnosticSeverity.Warning);
            results.push({ uri: entry.loc.uri, diagnostics: [diag] });
          }
        }
      }
    };

    checkDuplicates(this.procIndex);
    checkDuplicates(this.methodIndex);

    // unused variables: search for $name occurrences across workspace files
    const vars = Array.from(this.variableIndex.entries());
    const files = await vscode.workspace.findFiles('**/*.tcl');
    const docTexts: Map<string, string> = new Map();
    for (const f of files) {
      try { const d = await vscode.workspace.openTextDocument(f); docTexts.set(f.toString(), d.getText()); } catch (e) { }
    }

    for (const [name, arr] of vars) {
      let used = false;
      const searchPattern = new RegExp(`\\$${name}\\b`);
      for (const [, text] of docTexts) {
        if (searchPattern.test(text)) { used = true; break; }
      }
      if (!used) {
        for (const v of arr) {
          const d = new vscode.Diagnostic(v.loc.range, `Variable '${name}' appears to be unused`, vscode.DiagnosticSeverity.Information);
          results.push({ uri: v.loc.uri, diagnostics: [d] });
        }
      }
    }

    // aggregate diagnostics by uri
    const byUri = new Map<string, vscode.Diagnostic[]>();
    for (const r of results) {
      const key = r.uri.toString();
      const exist = byUri.get(key) || [];
      exist.push(...r.diagnostics);
      byUri.set(key, exist);
    }

    const out: Array<{ uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }> = [];
    for (const [k, diags] of byUri.entries()) {
      out.push({ uri: vscode.Uri.parse(k), diagnostics: diags });
    }
    return out;
  }

  async lookup(name: string): Promise<vscode.Location[]> {
    return this.lookupInContext(name, undefined);
  }

  // lookup with optional document context (to respect imports/namespaces)
  async lookupInContext(name: string, document?: vscode.TextDocument): Promise<vscode.Location[]> {
    // normalize and if fq name provided
    const normalized = name.replace(/^::+/, '');
    if (normalized.includes('::')) {
      return this.index.get(normalized) || [];
    }

    const simple = normalized.split('::').pop() || normalized;
    const entries: vscode.Location[] = [];

    // gather matching proc/method entries and filter by context
    const parr = this.procIndex.get(simple) || [];
    const marr = this.methodIndex.get(simple) || [];

    let fileInfo = document ? this.fileImports.get(document.uri.toString()) : undefined;

    const includeEntry = (entry: { fqName: string; namespace?: string }) => {
      if (!entry.namespace) return true;
      if (!fileInfo) return true;
      // include if the file declares the namespace
      if (fileInfo.fileNamespaces && fileInfo.fileNamespaces.has(entry.namespace)) return true;
      if (fileInfo.importedProcs.has(entry.fqName)) return true;
      if (fileInfo.importedNamespaces.has(entry.namespace)) return true;
      return false;
    };

    for (const p of parr) if (includeEntry(p)) entries.push(p.loc);
    for (const m of marr) if (includeEntry(m)) entries.push(m.loc);

    // fallback to general index entries (simple name or fq)
    if (!entries.length) {
      const exact = this.index.get(simple) || [];
      entries.push(...exact);
    }

    return entries;
  }

  async lookupVariable(name: string): Promise<{ loc: vscode.Location; value: string }[]> {
    const exact = this.variableIndex.get(name) || [];
    if (exact.length) return exact;
    const simple = name.split('::').pop() || name;
    return this.variableIndex.get(simple) || [];
  }

  // return list of indexed procs available in given document (respect namespaces/imports)
  async listProcs(prefix?: string, document?: vscode.TextDocument): Promise<string[]> {
    const results: string[] = [];
    const seen = new Set<string>();

    let fileInfo: { fileNamespaces: Set<string>; importedNamespaces: Set<string>; importedProcs: Set<string> } | undefined;
    if (document) fileInfo = this.fileImports.get(document.uri.toString());

    const includeEntry = (entry: { fqName: string; namespace?: string }) => {
      // always include global (no namespace)
      if (!entry.namespace) return true;
      // if no document context, include
      if (!fileInfo) return true;
      // same namespace (file may declare multiple namespaces)
      if (fileInfo.fileNamespaces && fileInfo.fileNamespaces.has(entry.namespace || '')) return true;
      // imported explicit proc
      if (fileInfo.importedProcs.has(entry.fqName)) return true;
      // imported namespace wildcard
      if (fileInfo.importedNamespaces.has(entry.namespace)) return true;
      return false;
    };

    for (const [name, arr] of this.procIndex.entries()) {
      if (prefix && !name.toLowerCase().startsWith(prefix.toLowerCase())) continue;
      for (const p of arr) {
        if (!includeEntry(p)) continue;
        if (!seen.has(p.fqName)) { seen.add(p.fqName); results.push(p.fqName); }
      }
    }
    for (const [name, arr] of this.methodIndex.entries()) {
      if (prefix && !name.toLowerCase().startsWith(prefix.toLowerCase())) continue;
      for (const p of arr) {
        if (!includeEntry(p)) continue;
        if (!seen.has(p.fqName)) { seen.add(p.fqName); results.push(p.fqName); }
      }
    }
    return results;
  }

  // list all known namespaces (normalized, excluding empty/global)
  listNamespaces(): string[] {
    const set = new Set<string>();
    for (const arr of this.procIndex.values()) {
      for (const p of arr) if (p.namespace) set.add(p.namespace);
    }
    for (const arr of this.methodIndex.values()) {
      for (const p of arr) if (p.namespace) set.add(p.namespace);
    }
    return Array.from(set).sort();
  }

  // list procs inside a given namespace (fq namespace name without leading ::)
  listProcsInNamespace(namespace: string, prefix?: string, document?: vscode.TextDocument): string[] {
    const results: string[] = [];
    const seen = new Set<string>();
    const ns = namespace.replace(/^::+/, '');
    const pref = prefix || '';
    const prefLower = pref.toLowerCase();

    const include = (p: { fqName: string; namespace?: string }) => {
      if (!p.namespace) return false;
      return p.namespace.toLowerCase() === ns.toLowerCase();
    };

    for (const arr of this.procIndex.values()) {
      for (const p of arr) {
        if (!include(p)) continue;
        const short = p.fqName.split('::').pop() || p.fqName;
        if (pref && !short.toLowerCase().startsWith(prefLower)) continue;
        if (!seen.has(p.fqName)) { seen.add(p.fqName); results.push(p.fqName); }
      }
    }
    for (const arr of this.methodIndex.values()) {
      for (const p of arr) {
        if (!include(p)) continue;
        const short = p.fqName.split('::').pop() || p.fqName;
        if (pref && !short.toLowerCase().startsWith(prefLower)) continue;
        if (!seen.has(p.fqName)) { seen.add(p.fqName); results.push(p.fqName); }
      }
    }

    return results.sort();
  }

  // return all variables (optionally filtered by prefix)
  listVariables(prefix?: string): Array<{ name: string; value: string; loc: vscode.Location }> {
    const results: Array<{ name: string; value: string; loc: vscode.Location }> = [];
    for (const [name, arr] of this.variableIndex.entries()) {
      if (prefix && !name.startsWith(prefix)) continue;
      for (const e of arr) {
        results.push({ name, value: e.value, loc: e.loc });
      }
    }
    return results;
  }

  getProcSignatures(name: string, document?: vscode.TextDocument): Array<{ params: string[]; loc: vscode.Location; fqName: string }> {
    const results: Array<{ params: string[]; loc: vscode.Location; fqName: string }> = [];
    // normalize input (strip leading ::)
    const normalizedName = name.replace(/^::+/, '');
    // if fq name requested
    if (normalizedName.includes('::')) {
      const simple = normalizedName.split('::').pop() || normalizedName;
      const parr = this.procIndex.get(simple) || [];
      for (const p of parr) {
        if (p.fqName.toLowerCase() === normalizedName.toLowerCase()) results.push({ params: p.params, loc: p.loc, fqName: p.fqName });
      }
      const marr = this.methodIndex.get(simple) || [];
      for (const m of marr) {
        if (m.fqName.toLowerCase() === normalizedName.toLowerCase()) results.push({ params: m.params, loc: m.loc, fqName: m.fqName });
      }
      return results;
    }

    // otherwise filter by document context
    let fileInfo: { fileNamespaces: Set<string>; importedNamespaces: Set<string>; importedProcs: Set<string> } | undefined;
    if (document) fileInfo = this.fileImports.get(document.uri.toString());

    const includeEntry = (entry: { fqName: string; namespace?: string }) => {
      if (!entry.namespace) return true;
      if (!fileInfo) return true;
      if (fileInfo.fileNamespaces && fileInfo.fileNamespaces.has(entry.namespace || '')) return true;
      if (fileInfo.importedProcs.has(entry.fqName)) return true;
      if (fileInfo.importedNamespaces.has(entry.namespace)) return true;
      return false;
    };

    const simple = name.split('::').pop() || name;
    const parr = this.procIndex.get(simple) || [];
    for (const p of parr) if (includeEntry(p)) results.push({ params: p.params, loc: p.loc, fqName: p.fqName });
    const marr = this.methodIndex.get(simple) || [];
    for (const m of marr) if (includeEntry(m)) results.push({ params: m.params, loc: m.loc, fqName: m.fqName });
    return results;
  }
}
