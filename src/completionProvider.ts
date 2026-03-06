import * as vscode from 'vscode';
import { TclIndexer } from './indexer';
import { BUILTINS, SNIPPETS } from './builtins';
import { buildProcSnippet } from './completionUtils';

export class TclCompletionProvider implements vscode.CompletionItemProvider {
  private indexer: TclIndexer;
  private snippetsEnabled: boolean;

  constructor(indexer: TclIndexer, snippetsEnabled: boolean = true) {
    this.indexer = indexer;
    this.snippetsEnabled = snippetsEnabled;
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

  // Check if we're completing dict variable name after "dict get "
  // Pattern: dict get <cursor> or dict get $<partial>
  const lineText = document.lineAt(position.line).text;
  const textBeforeCursor = lineText.substring(0, position.character);
  const dictVarMatch = textBeforeCursor.match(/dict\s+get\s+\$?(\w*)$/);
  
  if (dictVarMatch && !textBeforeCursor.match(/dict\s+get\s+\$\w+\s+\w/)) {
    // We're at dict get position, suggest available dictionaries
    const partial = dictVarMatch[1] || '';
    const dicts = this.indexer.listDictionaries();
    
    for (const dict of dicts) {
      // Skip nested dicts (they have parentDict)
      if (dict.parentDict) continue;
      
      if (partial && !dict.name.toLowerCase().startsWith(partial.toLowerCase())) continue;
      
      const dictItem = new vscode.CompletionItem(`$${dict.name}`, vscode.CompletionItemKind.Variable);
      dictItem.detail = `Dictionary with keys: ${dict.keys.join(', ')}`;
      dictItem.insertText = dict.name;
      dictItem.sortText = `0_${dict.name}`; // Sort dicts first
      
      // Add documentation showing all keys
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**Dictionary**: \`$${dict.name}\`\n\n`);
      md.appendMarkdown(`**Keys**: ${dict.keys.map(k => `\`${k}\``).join(', ')}\n`);
      dictItem.documentation = md;
      
      items.push(dictItem);
    }
    
    // Return early whether we found dicts or not
    // This prevents showing unrelated proc/builtin completions
    return items;
  }

  // Check if we're completing dict variable name after other dict commands
  // Pattern: dict <command> <cursor> or dict <command> <partial>
  // Commands: set, lappend, incr, unset, append, exists, update
  // Note: Modification commands don't use $ in TCL syntax
  const dictCommandVarMatch = textBeforeCursor.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w*)$/);
  
  if (dictCommandVarMatch && !textBeforeCursor.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?\w+\s+\w/)) {
    const command = dictCommandVarMatch[1];
    const partial = dictCommandVarMatch[2] || '';
    const dicts = this.indexer.listDictionaries();
    
    // Modification commands (set, lappend, incr, etc.) don't use $ in TCL
    const isModificationCommand = ['set', 'lappend', 'incr', 'unset', 'append', 'update', 'remove', 'replace'].includes(command);
    
    for (const dict of dicts) {
      // Skip nested dicts (they have parentDict)
      if (dict.parentDict) continue;
      
      if (partial && !dict.name.toLowerCase().startsWith(partial.toLowerCase())) continue;
      
      // For modification commands, show without $; for read commands, show with $
      const displayName = isModificationCommand ? dict.name : `$${dict.name}`;
      const dictItem = new vscode.CompletionItem(displayName, vscode.CompletionItemKind.Variable);
      dictItem.detail = `Dictionary with keys: ${dict.keys.join(', ')}`;
      dictItem.insertText = dict.name; // Always insert without $
      dictItem.sortText = `0_${dict.name}`; // Sort dicts first
      
      // Add documentation showing all keys
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**Dictionary**: \`${displayName}\`\n\n`);
      md.appendMarkdown(`**Keys**: ${dict.keys.map(k => `\`${k}\``).join(', ')}\n`);
      dictItem.documentation = md;
      
      items.push(dictItem);
    }
    
    // Return early whether we found dicts or not
    // This prevents showing unrelated proc/builtin completions
    return items;
  }

  // Check if we're completing dict get keys
  // Pattern: dict get $varName <cursor> or dict get $varName key1 <cursor>
  const dictGetMatch = textBeforeCursor.match(/dict\s+get\s+\$(\w+)(?:\s+(\w+))*\s*$/);
  
  if (dictGetMatch) {
    const varName = dictGetMatch[1];
    const previousKeys = dictGetMatch[2] ? textBeforeCursor.match(/dict\s+get\s+\$\w+\s+([\w\s]+)$/)?.[1].trim().split(/\s+/) : [];
    
    // If we have previous keys, try to find the nested dict
    let targetDict = varName;
    if (previousKeys && previousKeys.length > 0) {
      // Check if the last key is a nested dict
      const lastKey = previousKeys[previousKeys.length - 1];
      const dictKeys = this.indexer.getDictKeys(varName);
      
      // Find if this key points to a nested dict
      if (dictKeys.includes(lastKey)) {
        // Check if there's a dict with this name that has varName as parent
        targetDict = lastKey;
      }
    }
    
    const dictKeys = this.indexer.getDictKeys(targetDict);
    
    if (dictKeys.length > 0) {
      for (const key of dictKeys) {
        if (prefix && !key.toLowerCase().startsWith(prefixLower)) continue;
        const keyItem = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
        keyItem.detail = `Dictionary key in $${varName}`;
        
        // Check if this key is itself a nested dict
        const parentDict = this.indexer.getParentDict(key);
        if (parentDict === targetDict) {
          const nestedKeys = this.indexer.getDictKeys(key);
          if (nestedKeys.length > 0) {
            keyItem.detail += ` (nested dict with keys: ${nestedKeys.join(', ')})`;
          }
        }
        
        keyItem.insertText = key;
        keyItem.sortText = `0_${key}`; // Sort dict keys first
        items.push(keyItem);
      }
      
      // Return early to avoid showing other completions
      // Even if no keys found, we matched a dict get pattern
      return items;
    }
  }

  // Check for other dict commands that need key suggestions
  // Pattern: dict <command> [optional$]varName [key value]* <cursor>
  // Commands: set, lappend, incr, unset, append, exists, update
  // Note: Modification commands (set, lappend, incr, etc.) don't use $ in TCL, but we support both
  // For set/append/lappend, we support multiple key-value pairs, so we need to check if we're at a key position
  const dictCommandPattern = /dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/;
  const dictCommandMatch = textBeforeCursor.match(dictCommandPattern);
  
  if (dictCommandMatch) {
    const dictCommand = dictCommandMatch[1];
    const varName = dictCommandMatch[2];
    const afterVar = dictCommandMatch[3] || '';
    
    // For commands that support multiple key-value pairs (set, append, lappend),
    // we need to determine if we're at a key position (even token count) or value position (odd token count)
    const supportsMultipleKvp = ['set', 'append', 'lappend'].includes(dictCommand);
    
    // Simple tokenization: split by spaces, but treat quoted strings and braces as single tokens
    // This is a simplified tokenizer that handles most common cases
    const tokens: string[] = [];
    let currentToken = '';
    let inQuotes = false;
    let inBraces = 0;
    
    for (let i = 0; i < afterVar.length; i++) {
      const char = afterVar[i];
      
      if (char === '"' && afterVar[i - 1] !== '\\') {
        inQuotes = !inQuotes;
        currentToken += char;
      } else if (char === '{' && !inQuotes) {
        inBraces++;
        currentToken += char;
      } else if (char === '}' && !inQuotes && inBraces > 0) {
        inBraces--;
        currentToken += char;
      } else if (char === ' ' && !inQuotes && inBraces === 0) {
        if (currentToken.trim()) {
          tokens.push(currentToken.trim());
          currentToken = '';
        }
      } else {
        currentToken += char;
      }
    }
    
    // Don't forget the last token if we're building one
    const partialKey = currentToken.trim();
    
    // Determine if we should show completions
    let shouldComplete = false;
    
    if (supportsMultipleKvp) {
      // For commands supporting multiple pairs: show completion if token count is even
      // (0 = first key, 2 = second key after first value, 4 = third key, etc.)
      shouldComplete = (tokens.length % 2 === 0);
    } else {
      // For other commands: only show completion if we have no complete tokens yet
      shouldComplete = (tokens.length === 0);
    }
    
    if (shouldComplete) {
      const dictKeys = this.indexer.getDictKeys(varName);
      
      // Extract already used keys from the tokens array
      // Keys are at even indices: 0, 2, 4, ... (tokens[0] = key1, tokens[2] = key2, etc.)
      const usedKeys = new Set<string>();
      for (let i = 0; i < tokens.length; i += 2) {
        usedKeys.add(tokens[i].replace(/^["']|["']$/g, '')); // Remove quotes if present
      }
      
      if (dictKeys.length > 0) {
        for (const key of dictKeys) {
          // Skip keys that have already been used
          if (usedKeys.has(key)) continue;
          
          // Filter by partial key if provided
          if (partialKey && !key.toLowerCase().startsWith(partialKey.toLowerCase())) continue;
          
          const keyItem = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
          keyItem.detail = `Key in dictionary $${varName}`;
          
          // Provide command-specific snippet
          switch (dictCommand) {
            case 'set':
              keyItem.insertText = new vscode.SnippetString(`${key} \${1:value}`);
              keyItem.detail += ' — dict set';
              break;
            case 'lappend':
              keyItem.insertText = new vscode.SnippetString(`${key} \${1:value}`);
              keyItem.detail += ' — dict lappend';
              break;
            case 'incr':
              keyItem.insertText = new vscode.SnippetString(`${key} \${1:?increment?}`);
              keyItem.detail += ' — dict incr';
              break;
            case 'append':
              keyItem.insertText = new vscode.SnippetString(`${key} \${1:value}`);
              keyItem.detail += ' — dict append';
              break;
            default:
              keyItem.insertText = key;
          }
          
          keyItem.sortText = `0_${key}`; // Sort dict keys first
          items.push(keyItem);
        }
      }
    }
    
    // Return early whether we're showing key completions or not
    // If shouldComplete is false, we're at a value position and shouldn't show any completions
    // This prevents showing unrelated proc/builtin completions in dict command context
    return items;
  }

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
  if (this.snippetsEnabled) {
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
