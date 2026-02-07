import * as vscode from 'vscode';

export class TclIndexer {
  private index: Map<string, vscode.Location[]> = new Map();
  private watcher?: vscode.FileSystemWatcher;

  activate(context: vscode.ExtensionContext) {
    this.buildIndex();
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.tcl');
    this.watcher.onDidCreate(uri => this.indexFile(uri));
    this.watcher.onDidChange(uri => this.indexFile(uri));
    this.watcher.onDidDelete(uri => this.removeFile(uri));
    context.subscriptions.push(this.watcher);
  }

  async buildIndex() {
    this.index.clear();
    const files = await vscode.workspace.findFiles('**/*.tcl');
    await Promise.all(files.map(f => this.indexFile(f)));
  }

  async indexFile(uri: vscode.Uri) {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const lines = doc.getText().split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(/^\s*proc\s+([A-Za-z0-9_:.]+)/);
        if (m && m[1]) {
          const name = m[1];
          const pos = new vscode.Position(i, line.indexOf(name));
          const loc = new vscode.Location(uri, pos);
          const arr = this.index.get(name) || [];
          // remove existing location for same uri/line
          const exists = arr.findIndex(l => l.uri.toString() === uri.toString() && l.range.start.line === i);
          if (exists === -1) {
            arr.push(loc);
            this.index.set(name, arr);
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
  }

  async lookup(name: string): Promise<vscode.Location[]> {
    // exact match
    const exact = this.index.get(name);
    if (exact && exact.length) return exact;

    // try namespace-like split (pkg::name)
    const simple = name.split('::').pop() || name;
    return this.index.get(simple) || [];
  }
}
