import * as vscode from 'vscode';

export class TclIndexer {
  private index: Map<string, vscode.Location[]> = new Map();
  private variableIndex: Map<string, { loc: vscode.Location; value: string }[]> = new Map();
  private procIndex: Map<string, { loc: vscode.Location; params: string[] }[]> = new Map();
  private methodIndex: Map<string, { loc: vscode.Location; params: string[] }[]> = new Map();
  private watcher?: vscode.FileSystemWatcher;

  activate(context: vscode.ExtensionContext) {
    this.buildIndex();
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.tcl');
    this.watcher.onDidCreate(uri => this.indexFile(uri));
    this.watcher.onDidChange(uri => this.indexFile(uri));
    this.watcher.onDidDelete(uri => this.removeFile(uri));
    context.subscriptions.push(this.watcher as vscode.Disposable);
  }

  async buildIndex() {
    this.index.clear();
    this.variableIndex.clear();
    const files = await vscode.workspace.findFiles('**/*.tcl');
    await Promise.all(files.map(f => this.indexFile(f)));
  }

  async indexFile(uri: vscode.Uri) {
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const lines = doc.getText().split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // match both 'proc' and 'method'
      const m = line.match(/^\s*(proc|method)\s+([A-Za-z0-9_:.]+)\s+\{([^}]*)\}/);
      if (m && m[2]) {
        const type = m[1];           // 'proc' or 'method'
        const name = m[2];
        const paramsRaw = m[3] || '';
        const params = paramsRaw.split(/\s+/).filter(Boolean);

        const pos = new vscode.Position(i, line.indexOf(name));
        const loc = new vscode.Location(uri, pos);

        // general index for hover
        const arr = this.index.get(name) || [];
        const exists = arr.findIndex(l => l.uri.toString() === uri.toString() && l.range.start.line === i);
        if (exists === -1) {
          arr.push(loc);
          this.index.set(name, arr);
        }

        // proc/method-specific index
        const indexMap = type === 'proc' ? this.procIndex : this.methodIndex;
        const pArr = indexMap.get(name) || [];
        const pExists = pArr.findIndex(p => p.loc.uri.toString() === uri.toString() && p.loc.range.start.line === i);
        if (pExists === -1) {
          pArr.push({ loc, params });
          indexMap.set(name, pArr);
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
  } catch (e) {
    // ignore unreadable files
  }
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
  }

  async lookup(name: string): Promise<vscode.Location[]> {
    const exact = this.index.get(name);
    if (exact && exact.length) return exact;
    const simple = name.split('::').pop() || name;
    return this.index.get(simple) || [];
  }

  async lookupVariable(name: string): Promise<{ loc: vscode.Location; value: string }[]> {
    const exact = this.variableIndex.get(name) || [];
    if (exact.length) return exact;
    const simple = name.split('::').pop() || name;
    return this.variableIndex.get(simple) || [];
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

  // return list of indexed procs (names)
  listProcs(prefix?: string): string[] {
    const results: string[] = [];
    const seen = new Set<string>();
    for (const name of this.procIndex.keys()) {
      if (prefix && !name.startsWith(prefix)) continue;
      if (!seen.has(name)) { seen.add(name); results.push(name); }
    }
    for (const name of this.methodIndex.keys()) {
      if (prefix && !name.startsWith(prefix)) continue;
      if (!seen.has(name)) { seen.add(name); results.push(name); }
    }
    return results;
  }

  getProcSignatures(name: string): Array<{ params: string[]; loc: vscode.Location }> {
    const results: Array<{ params: string[]; loc: vscode.Location }> = [];
    const parr = this.procIndex.get(name) || [];
    for (const p of parr) results.push({ params: p.params, loc: p.loc });
    const marr = this.methodIndex.get(name) || [];
    for (const m of marr) results.push({ params: m.params, loc: m.loc });
    return results;
  }
}
