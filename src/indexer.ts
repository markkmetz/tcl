import * as vscode from 'vscode';
import { parseDefinitionLine } from './parser';
import { collectProcMethodReferences } from './referenceUtils';

export interface TclIndexerStatus {
  state: 'idle' | 'indexing' | 'error';
  message: string;
  filesTotal?: number;
  filesProcessed?: number;
  durationMs?: number;
}

export class TclIndexer {
  private index: Map<string, vscode.Location[]> = new Map();
  private variableIndex: Map<string, { loc: vscode.Location; value: string }[]> = new Map();
  private procIndex: Map<string, { loc: vscode.Location; params: string[]; fqName: string; normalizedFqName: string; namespace?: string }[]> = new Map();
  private methodIndex: Map<string, { loc: vscode.Location; params: string[]; fqName: string; normalizedFqName: string; namespace?: string }[]> = new Map();
  private dictIndex: Map<string, { keys: Set<string>; line: number; parentDict?: string }> = new Map();
  private watcher?: vscode.FileSystemWatcher;
  private externalPaths: string[] = [];
  private externalWatchers: vscode.FileSystemWatcher[] = [];
  private fileImports: Map<string, { fileNamespaces: Set<string>; importedNamespaces: Set<string>; importedProcs: Set<string> }> = new Map();
  private _onDidIndex = new vscode.EventEmitter<void>();
  private _onDidStatus = new vscode.EventEmitter<TclIndexerStatus>();
  private _onDidLog = new vscode.EventEmitter<string>();
  public readonly onDidIndex = this._onDidIndex.event;
  public readonly onDidStatus = this._onDidStatus.event;
  public readonly onDidLog = this._onDidLog.event;

  private log(message: string) {
    const ts = new Date().toISOString();
    this._onDidLog.fire(`[${ts}] ${message}`);
  }

  private setStatus(status: TclIndexerStatus) {
    this._onDidStatus.fire(status);
  }

  activate(context: vscode.ExtensionContext) {
    this.log('Indexer activated');
    this.buildIndex();
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.tcl');
    this.watcher.onDidCreate(uri => {
      this.log(`File created: ${uri.fsPath}`);
      this.indexFile(uri, 'watch:create');
    });
    this.watcher.onDidChange(uri => {
      this.log(`File changed: ${uri.fsPath}`);
      this.indexFile(uri, 'watch:change');
    });
    this.watcher.onDidDelete(uri => {
      this.log(`File deleted: ${uri.fsPath}`);
      this.removeFile(uri);
      this._onDidIndex.fire();
    });
    context.subscriptions.push(this.watcher as vscode.Disposable);

    // read configured external paths and set watchers
    const cfg = vscode.workspace.getConfiguration('tcl');
    const external = cfg.get<string[]>('index.externalPaths') || [];
    if (external && external.length) this.setExternalPaths(external, context);
  }

  async buildIndex() {
    const startedAt = Date.now();
    this.log('Starting full index rebuild');
    this.index.clear();
    this.variableIndex.clear();
    this.procIndex.clear();
    this.methodIndex.clear();
    this.dictIndex.clear();
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

    this.setStatus({
      state: 'indexing',
      message: `Indexing ${allFiles.length} Tcl files`,
      filesTotal: allFiles.length,
      filesProcessed: 0
    });

    await Promise.all(allFiles.map(f => this.indexFile(f)));
    const durationMs = Date.now() - startedAt;
    this.log(`Completed full index rebuild: ${allFiles.length} files in ${durationMs}ms`);
    this.setStatus({
      state: 'idle',
      message: `Indexed ${allFiles.length} Tcl files`,
      filesTotal: allFiles.length,
      filesProcessed: allFiles.length,
      durationMs
    });
    this._onDidIndex.fire();
  }

  async setExternalPaths(paths: string[], context?: vscode.ExtensionContext) {
    // dispose old watchers
    for (const w of this.externalWatchers) { w.dispose(); }
    this.externalWatchers = [];
    this.externalPaths = paths || [];
    this.log(`Configured external index paths: ${this.externalPaths.length}`);

    for (const p of this.externalPaths) {
      try {
        const pattern = `${p.replace(/\\/g, '/')}/**/*.tcl`;
        const w = vscode.workspace.createFileSystemWatcher(pattern);
        w.onDidCreate(uri => {
          this.log(`External file created: ${uri.fsPath}`);
          this.indexFile(uri, 'external:create');
        });
        w.onDidChange(uri => {
          this.log(`External file changed: ${uri.fsPath}`);
          this.indexFile(uri, 'external:change');
        });
        w.onDidDelete(uri => {
          this.log(`External file deleted: ${uri.fsPath}`);
          this.removeFile(uri);
          this._onDidIndex.fire();
        });
        this.externalWatchers.push(w);
        if (context) context.subscriptions.push(w as vscode.Disposable);
      } catch (e) {
        // ignore watcher creation errors
      }
    }

    // rebuild index to include newly added external files
    await this.buildIndex();
  }

  async indexFile(uri: vscode.Uri, source: string = 'manual') {
  try {
    this.log(`Indexing file (${source}): ${uri.fsPath}`);
    // remove existing entries for this file before re-indexing
    this.removeFile(uri);

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

      // count braces on this line to track depth (ignore braces inside strings)
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
        const hasLeading = /^::+/.test(name);
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

        const normalizedFqName = defNamespace ? `${defNamespace}::${simpleName}` : simpleName;
        const fqName = hasLeading ? `::${normalizedFqName}` : normalizedFqName;
        // Use the original name from the line to get correct column position
        const nameToFind = name.replace(/^::+/, '');
        const pos = new vscode.Position(i, line.indexOf(nameToFind));
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
          const normalizedFq = normalizedFqName;
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
          pArr.push({ loc, params, fqName, normalizedFqName, namespace: defNamespace });
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

        // Parse dict create: set varname [dict create key1 val1 key2 val2]
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
          // Import the parser's extractDictPairs function
          const parsedPairs = this.extractDictPairs(pairsContent);
          const keys = new Set<string>();
          
          for (const pair of parsedPairs) {
            if (!pair.key.startsWith('$')) {
              keys.add(pair.key);
              
              // If this pair contains a nested dict, add it as a separate entry
              if (pair.isDict && pair.dictKeys) {
                this.dictIndex.set(pair.key, { keys: new Set(pair.dictKeys), line: i, parentDict: vname });
              }
            }
          }
          
          if (keys.size > 0) {
            this.dictIndex.set(vname, { keys, line: i });
          }
        }

        // Parse dict set: dict set varname key value
        const dictSetMatch = line.match(/dict\s+set\s+([A-Za-z0-9_:.]+)\s+([A-Za-z0-9_]+)/);
        if (dictSetMatch && dictSetMatch[1]) {
          const dictVar = dictSetMatch[1];
          const key = dictSetMatch[2];
          const existing = this.dictIndex.get(dictVar);
          if (existing) {
            existing.keys.add(key);
          } else {
            this.dictIndex.set(dictVar, { keys: new Set([key]), line: i });
          }
        }
      }
    }

    // store imports/namespace info for this file
    const fileKey = uri.toString();
    this.fileImports.set(fileKey, { fileNamespaces, importedNamespaces, importedProcs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    this.log(`Failed to index file: ${uri.fsPath} (${msg})`);
    this.setStatus({ state: 'error', message: `Index error: ${uri.fsPath}` });
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
    // Clear dicts from removed file (simplified: clear all since we track by var name only)
    this.dictIndex.clear();
    // also clean up fileImports
    this.fileImports.delete(uri.toString());
    // Note: don't fire _onDidIndex here as this is called from indexFile
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
    type ScoredLoc = { loc: vscode.Location; priority: number };
    const scored: ScoredLoc[] = [];

    // gather matching proc/method entries and filter by context
    const parr = this.procIndex.get(simple) || [];
    const marr = this.methodIndex.get(simple) || [];

    const docKey = document?.uri.toString();
    let fileInfo = document ? this.fileImports.get(document.uri.toString()) : undefined;

    const includeEntry = (entry: { normalizedFqName: string; namespace?: string }) => {
      if (!entry.namespace) return true;
      if (!fileInfo) return true;
      // include if the file declares the namespace
      if (fileInfo.fileNamespaces && fileInfo.fileNamespaces.has(entry.namespace)) return true;
      if (fileInfo.importedProcs.has(entry.normalizedFqName)) return true;
      if (fileInfo.importedNamespaces.has(entry.namespace)) return true;
      return false;
    };

    // Priority: 0 = current file, 1 = imported/same namespace, 2 = workspace
    const entryPriority = (entry: { normalizedFqName: string; namespace?: string; loc: vscode.Location }) => {
      if (docKey && entry.loc.uri.toString() === docKey) return 0;
      if (!fileInfo) return 2;
      if (entry.namespace && fileInfo.fileNamespaces && fileInfo.fileNamespaces.has(entry.namespace)) return 1;
      if (fileInfo.importedProcs.has(entry.normalizedFqName)) return 1;
      if (entry.namespace && fileInfo.importedNamespaces.has(entry.namespace)) return 1;
      return 2;
    };

    for (const p of parr) if (includeEntry(p)) scored.push({ loc: p.loc, priority: entryPriority(p) });
    for (const m of marr) if (includeEntry(m)) scored.push({ loc: m.loc, priority: entryPriority(m) });

    // fallback to general index entries (simple name or fq)
    if (!scored.length) {
      const exact = this.index.get(simple) || [];
      for (const loc of exact) scored.push({ loc, priority: 2 });
    }

    scored.sort((a, b) => a.priority - b.priority);
    return scored.map(s => s.loc);
  }

  async lookupVariable(name: string): Promise<{ loc: vscode.Location; value: string }[]> {
    const exact = this.variableIndex.get(name) || [];
    if (exact.length) return exact;
    const simple = name.split('::').pop() || name;
    return this.variableIndex.get(simple) || [];
  }

  lookupNamespace(namespace: string): vscode.Location[] {
    const normalized = (namespace || '').replace(/^::+/, '').toLowerCase();
    if (!normalized) return [];

    const dedupe = new Map<string, vscode.Location>();
    const add = (loc: vscode.Location) => {
      const key = `${loc.uri.toString()}:${loc.range.start.line}:${loc.range.start.character}`;
      if (!dedupe.has(key)) dedupe.set(key, loc);
    };

    for (const arr of this.procIndex.values()) {
      for (const p of arr) {
        if ((p.namespace || '').toLowerCase() === normalized) add(p.loc);
      }
    }

    for (const arr of this.methodIndex.values()) {
      for (const m of arr) {
        if ((m.namespace || '').toLowerCase() === normalized) add(m.loc);
      }
    }

    return Array.from(dedupe.values());
  }

  // return list of indexed procs available in given document (respect namespaces/imports)
  async listProcs(prefix?: string, document?: vscode.TextDocument): Promise<string[]> {
    const results: string[] = [];
    const seen = new Set<string>();

    let fileInfo: { fileNamespaces: Set<string>; importedNamespaces: Set<string>; importedProcs: Set<string> } | undefined;
    if (document) fileInfo = this.fileImports.get(document.uri.toString());

    const includeEntry = (entry: { normalizedFqName: string; namespace?: string }) => {
      // always include global (no namespace)
      if (!entry.namespace) return true;
      // if no document context, include
      if (!fileInfo) return true;
      // same namespace (file may declare multiple namespaces)
      if (fileInfo.fileNamespaces && fileInfo.fileNamespaces.has(entry.namespace || '')) return true;
      // imported explicit proc
      if (fileInfo.importedProcs.has(entry.normalizedFqName)) return true;
      // imported namespace wildcard
      if (fileInfo.importedNamespaces.has(entry.namespace)) return true;
      return false;
    };

    for (const [name, arr] of this.procIndex.entries()) {
      if (prefix && !name.toLowerCase().startsWith(prefix.toLowerCase())) continue;
      for (const p of arr) {
        if (!includeEntry(p)) continue;
        if (!seen.has(p.normalizedFqName)) { seen.add(p.normalizedFqName); results.push(p.normalizedFqName); }
      }
    }
    for (const [name, arr] of this.methodIndex.entries()) {
      if (prefix && !name.toLowerCase().startsWith(prefix.toLowerCase())) continue;
      for (const p of arr) {
        if (!includeEntry(p)) continue;
        if (!seen.has(p.normalizedFqName)) { seen.add(p.normalizedFqName); results.push(p.normalizedFqName); }
      }
    }
    return results;
  }

  // return all indexed procs and methods with their types (for semantic highlighting)
  getAllProcMethodTypes(): Map<string, 'proc' | 'method'> {
    const typeMap = new Map<string, 'proc' | 'method'>();
    
    // Add all procs
    for (const [_, arr] of this.procIndex.entries()) {
      for (const p of arr) {
        const normalized = p.normalizedFqName.replace(/^::+/, '').toLowerCase();
        const short = (normalized.split('::').pop() || normalized).toLowerCase();
        typeMap.set(normalized, 'proc');
        typeMap.set(short, 'proc');
      }
    }
    
    // Add all methods (these override procs if there's a collision)
    for (const [_, arr] of this.methodIndex.entries()) {
      for (const m of arr) {
        const normalized = m.normalizedFqName.replace(/^::+/, '').toLowerCase();
        const short = (normalized.split('::').pop() || normalized).toLowerCase();
        typeMap.set(normalized, 'method');
        typeMap.set(short, 'method');
      }
    }
    
    return typeMap;
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

    const include = (p: { normalizedFqName: string; namespace?: string }) => {
      if (!p.namespace) return false;
      return p.namespace.toLowerCase() === ns.toLowerCase();
    };

    for (const arr of this.procIndex.values()) {
      for (const p of arr) {
        if (!include(p)) continue;
        const short = p.normalizedFqName.split('::').pop() || p.normalizedFqName;
        if (pref && !short.toLowerCase().startsWith(prefLower)) continue;
        if (!seen.has(p.normalizedFqName)) { seen.add(p.normalizedFqName); results.push(p.normalizedFqName); }
      }
    }
    for (const arr of this.methodIndex.values()) {
      for (const p of arr) {
        if (!include(p)) continue;
        const short = p.normalizedFqName.split('::').pop() || p.normalizedFqName;
        if (pref && !short.toLowerCase().startsWith(prefLower)) continue;
        if (!seen.has(p.normalizedFqName)) { seen.add(p.normalizedFqName); results.push(p.normalizedFqName); }
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

  getDocumentSignatures(document: vscode.TextDocument): Array<{ params: string[]; loc: vscode.Location; fqName: string; normalizedFqName: string; type: 'proc' | 'method' }> {
    const results: Array<{ params: string[]; loc: vscode.Location; fqName: string; normalizedFqName: string; type: 'proc' | 'method' }> = [];
    const docKey = document.uri.toString();

    for (const arr of this.procIndex.values()) {
      for (const p of arr) {
        if (p.loc.uri.toString() === docKey) {
          results.push({ params: p.params, loc: p.loc, fqName: p.fqName, normalizedFqName: p.normalizedFqName, type: 'proc' });
        }
      }
    }

    for (const arr of this.methodIndex.values()) {
      for (const m of arr) {
        if (m.loc.uri.toString() === docKey) {
          results.push({ params: m.params, loc: m.loc, fqName: m.fqName, normalizedFqName: m.normalizedFqName, type: 'method' });
        }
      }
    }

    return results;
  }

  getProcSignatures(name: string, document?: vscode.TextDocument): Array<{ params: string[]; loc: vscode.Location; fqName: string }> {
    type ScoredSig = { params: string[]; loc: vscode.Location; fqName: string; priority: number };
    const scored: ScoredSig[] = [];
    // normalize input (strip leading ::)
    const normalizedName = name.replace(/^::+/, '');
    // if fq name requested
    if (normalizedName.includes('::')) {
      const simple = normalizedName.split('::').pop() || normalizedName;
      const parr = this.procIndex.get(simple) || [];
      for (const p of parr) {
        if (p.normalizedFqName.toLowerCase() === normalizedName.toLowerCase()) scored.push({ params: p.params, loc: p.loc, fqName: p.normalizedFqName, priority: 2 });
      }
      const marr = this.methodIndex.get(simple) || [];
      for (const m of marr) {
        if (m.normalizedFqName.toLowerCase() === normalizedName.toLowerCase()) scored.push({ params: m.params, loc: m.loc, fqName: m.normalizedFqName, priority: 2 });
      }
      scored.sort((a, b) => a.priority - b.priority);
      return scored.map(({ priority: _, ...rest }) => rest);
    }

    // otherwise filter by document context
    const docKey = document?.uri.toString();
    let fileInfo: { fileNamespaces: Set<string>; importedNamespaces: Set<string>; importedProcs: Set<string> } | undefined;
    if (document) fileInfo = this.fileImports.get(document.uri.toString());

    const includeEntry = (entry: { normalizedFqName: string; namespace?: string }) => {
      if (!entry.namespace) return true;
      if (!fileInfo) return true;
      if (fileInfo.fileNamespaces && fileInfo.fileNamespaces.has(entry.namespace || '')) return true;
      if (fileInfo.importedProcs.has(entry.normalizedFqName)) return true;
      if (fileInfo.importedNamespaces.has(entry.namespace)) return true;
      return false;
    };

    // Priority: 0 = current file, 1 = imported/same namespace, 2 = workspace
    const entryPriority = (entry: { normalizedFqName: string; namespace?: string; loc: vscode.Location }) => {
      if (docKey && entry.loc.uri.toString() === docKey) return 0;
      if (!fileInfo) return 2;
      if (entry.namespace && fileInfo.fileNamespaces && fileInfo.fileNamespaces.has(entry.namespace || '')) return 1;
      if (fileInfo.importedProcs.has(entry.normalizedFqName)) return 1;
      if (entry.namespace && fileInfo.importedNamespaces.has(entry.namespace)) return 1;
      return 2;
    };

    const simple = name.split('::').pop() || name;
    const parr = this.procIndex.get(simple) || [];
    for (const p of parr) if (includeEntry(p)) scored.push({ params: p.params, loc: p.loc, fqName: p.normalizedFqName, priority: entryPriority(p) });
    const marr = this.methodIndex.get(simple) || [];
    for (const m of marr) if (includeEntry(m)) scored.push({ params: m.params, loc: m.loc, fqName: m.normalizedFqName, priority: entryPriority(m) });
    scored.sort((a, b) => a.priority - b.priority);
    return scored.map(({ priority: _, ...rest }) => rest);
  }

  getDictKeys(varName: string): string[] {
    const dict = this.dictIndex.get(varName);
    if (!dict) return [];
    return Array.from(dict.keys).sort();
  }

  getParentDict(varName: string): string | undefined {
    const dict = this.dictIndex.get(varName);
    return dict?.parentDict;
  }

  getDictsContainingKey(key: string): Array<{ dictName: string; keys: string[]; parentDict?: string }> {
    const results: Array<{ dictName: string; keys: string[]; parentDict?: string }> = [];
    for (const [dictName, dictInfo] of this.dictIndex.entries()) {
      if (dictInfo.keys.has(key)) {
        results.push({
          dictName,
          keys: Array.from(dictInfo.keys).sort(),
          parentDict: dictInfo.parentDict
        });
      }
    }
    return results;
  }

  listDictionaries(): Array<{ name: string; keys: string[]; parentDict?: string }> {
    const results: Array<{ name: string; keys: string[]; parentDict?: string }> = [];
    for (const [name, dictInfo] of this.dictIndex.entries()) {
      results.push({
        name,
        keys: Array.from(dictInfo.keys).sort(),
        parentDict: dictInfo.parentDict
      });
    }
    return results;
  }

  async findProcMethodReferences(name: string, document?: vscode.TextDocument): Promise<vscode.Location[]> {
    const startTime = Date.now();
    const normalized = (name || '').replace(/^::+/, '');
    const short = normalized.split('::').pop() || normalized;
    const sigs = this.getProcSignatures(normalized, document);

    const symbols = new Set<string>([normalized, short]);
    // Collect which of the resolved symbols are TclOO methods so the reference
    // scanner can apply the looser "$obj method" call-site detection for them.
    const methodSymbolsSet = new Set<string>();
    for (const s of sigs) {
      const fq = (s.fqName || '').replace(/^::+/, '');
      if (!fq) continue;
      symbols.add(fq);
      const shortFq = fq.split('::').pop() || fq;
      symbols.add(shortFq);
    }
    // Mark any symbol that appears in methodIndex as a method symbol
    for (const sym of symbols) {
      if (this.methodIndex.has(sym)) {
        methodSymbolsSet.add(sym);
        const shortSym = sym.split('::').pop() || sym;
        methodSymbolsSet.add(shortSym);
      }
    }

    const files = await vscode.workspace.findFiles('**/*.tcl');
    this.log(`Code Lens: Finding references for '${normalized}' across ${files.length} file(s)...`);
    const refs: vscode.Location[] = [];

    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const lines = doc.getText().split(/\r?\n/);
        const found = collectProcMethodReferences(lines, Array.from(symbols), methodSymbolsSet.size ? methodSymbolsSet : undefined);
        for (const hit of found) {
          refs.push(new vscode.Location(file, new vscode.Position(hit.line, hit.character)));
        }
      } catch {
        // ignore unreadable files
      }
    }

    const dedupe = new Map<string, vscode.Location>();
    for (const loc of refs) {
      const key = `${loc.uri.toString()}:${loc.range.start.line}:${loc.range.start.character}`;
      if (!dedupe.has(key)) dedupe.set(key, loc);
    }
    const elapsed = Date.now() - startTime;
    this.log(`Code Lens: Found ${dedupe.size} reference(s) for '${normalized}' in ${elapsed}ms`);
    return Array.from(dedupe.values());
  }

  private extractDictPairs(content: string): Array<{ key: string; value: string; isDict: boolean; dictKeys?: string[] }> {
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
            const nestedPairs = this.extractDictPairs(nestedContent);
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
}
