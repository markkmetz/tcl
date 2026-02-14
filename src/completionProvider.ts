import * as vscode from 'vscode';
import { TclIndexer } from './indexer';
import { BUILTINS, SNIPPETS } from './builtins';
import { buildProcSnippet } from './completionUtils';

export class TclCompletionProvider implements vscode.CompletionItemProvider {
  private indexer: TclIndexer;

  constructor(indexer: TclIndexer) {
    this.indexer = indexer;
  }

async provideCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken,
  context: vscode.CompletionContext
): Promise<vscode.CompletionItem[] | vscode.CompletionList> {

  // get the current word prefix
  const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_:.]+/);
  const prefix = wordRange ? document.getText(wordRange) : '';

  const items: vscode.CompletionItem[] = [];
  const MAX_GLOBAL_PROCS = 50;
  const prefixLower = prefix.toLowerCase();

  // namespace-specific completion: user typed Namespace::partial or ::Namespace::partial
  const nsMatch = prefix.match(/^(::)?([A-Za-z0-9_:]+)::([A-Za-z0-9_]*)$/);
  if (nsMatch) {
    const namespace = nsMatch[2].replace(/^::+/, '');
    const partial = nsMatch[3] || '';
    const nsProcs = this.indexer.listProcsInNamespace(namespace, partial, document);
    for (const fq of nsProcs) {
      const short = fq.split('::').pop() || fq;
      // show full fqName as label but insert only short name so it appends to the typed namespace
      const item = new vscode.CompletionItem(fq, vscode.CompletionItemKind.Function);
      item.detail = `Tcl procedure in namespace ${namespace}`;
      const sigs = this.indexer.getProcSignatures(fq, document);
      if (sigs.length) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**Signature**\n\n`);
        md.appendMarkdown(sigs.map(s => `- ${s.params.join(' ')} — ${vscode.workspace.asRelativePath(s.loc.uri)}:${s.loc.range.start.line + 1}`).join('\n'));
        item.documentation = md;
      }
      const sigWithParams = sigs.find(s => Array.isArray(s.params) && s.params.length > 0);
      item.insertText = new vscode.SnippetString(buildProcSnippet(short, sigWithParams?.params));

      if (wordRange) {
        const lastIdx = prefix.lastIndexOf('::');
        const replaceStartCol = wordRange.start.character + (lastIdx >= 0 ? lastIdx + 2 : 0);
        const replaceStart = new vscode.Position(wordRange.start.line, replaceStartCol);
        item.range = new vscode.Range(replaceStart, wordRange.end);
      }
      items.push(item);
    }
    return items;
  }

  // show namespaces first to avoid flooding completions
  const nsList = this.indexer.listNamespaces();
  const nsPrefix = (prefix.split('::')[0] || '').toLowerCase();
  for (const ns of nsList) {
    if (nsPrefix && !ns.toLowerCase().startsWith(nsPrefix)) continue;
    const nitem = new vscode.CompletionItem(`${ns}::`, vscode.CompletionItemKind.Module);
    nitem.detail = 'Tcl namespace';
    nitem.insertText = `${ns}::`;
    // trigger suggestions after inserting the namespace so the namespace's functions appear immediately
    nitem.command = { command: 'editor.action.triggerSuggest', title: 'Trigger Suggest' };
    items.push(nitem);
  }

  // first add snippet templates (proc, namespace, etc.)
  const snippetKeys = Object.keys(SNIPPETS).filter(k => prefix === '' || k.toLowerCase().startsWith(prefixLower));
  for (const key of snippetKeys) {
    const meta = SNIPPETS[key];
    const sitem = new vscode.CompletionItem(key, vscode.CompletionItemKind.Snippet);
    sitem.detail = 'Tcl snippet';
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**Snippet**: ${key}\n\n`);
    md.appendMarkdown(`${meta.description}\n\n`);
    if (meta.params && meta.params.length) md.appendMarkdown(`**Params:** ${meta.params.join(' ')}`);
    sitem.documentation = md;
    sitem.insertText = new vscode.SnippetString(meta.snippet);
    items.push(sitem);
  }

  // add built-in commands that match the prefix (case-insensitive)
  const builtins = Object.keys(BUILTINS).filter(b => prefix === '' || b.toLowerCase().startsWith(prefixLower));
  for (const builtin of builtins) {
    const meta = BUILTINS[builtin];
    const bitem = new vscode.CompletionItem(builtin, vscode.CompletionItemKind.Function);
    bitem.detail = 'Tcl builtin';
    // documentation with description and params
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**Builtin**: ${builtin}\n\n`);
    md.appendMarkdown(`${meta.description}\n\n`);
    if (meta.params && meta.params.length) md.appendMarkdown(`**Params:** ${meta.params.join(' ')}`);
    bitem.documentation = md;

    // create snippet from params
    if (meta.params && meta.params.length) {
      const snippetText = `${builtin} ${meta.params
        .map((p, idx) => `\${${idx + 1}:${p}}`)
        .join(' ')}$0`;
      // fix escaped ${ to proper snippet syntax
      bitem.insertText = new vscode.SnippetString(snippetText.replace('\\${', '${'));
    } else {
      bitem.insertText = new vscode.SnippetString(`${builtin}$0`);
    }

    items.push(bitem);
  }

  // now add a limited number of global/local procs to avoid huge suggestion lists
  const procs = await this.indexer.listProcs(prefix, document);
  let added = 0;
  for (const procName of procs) {
    if (added >= MAX_GLOBAL_PROCS) break;
    const item = new vscode.CompletionItem(procName, vscode.CompletionItemKind.Function);

    // get all signatures for documentation
    const signatures = this.indexer.getProcSignatures(procName, document);
    const procLines = signatures.map(sig => {
      const rel = vscode.workspace.asRelativePath(sig.loc.uri);
      const lineNum = sig.loc.range.start.line + 1;
      const params = sig.params.length ? sig.params.join(' ') : '(no params)';
      return `- ${params} — Defined in ${rel}:${lineNum}`;
    });

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**Signature**\n\n`);
    if (procLines.length) md.appendMarkdown(procLines.join('\n'));
    else md.appendMarkdown('_Signature not found_');
    item.documentation = md;

    // build snippet using the first signature that has parameters
    const sigWithParams = signatures.find(s => Array.isArray(s.params) && s.params.length > 0);

    item.insertText = new vscode.SnippetString(buildProcSnippet(procName, sigWithParams?.params));

    items.push(item);
    added++;
  }

  return items;
}
}
