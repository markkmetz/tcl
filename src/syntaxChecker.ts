import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import {
  buildSyntaxInitScript,
  collectLightweightSyntaxIssues,
  classifySyntaxSeverity,
  extractErrorMessageAndLine,
  resolveTargetLine,
  selectPrimaryFrame,
} from './syntaxCheckerUtils';
import { TclIndexer } from './indexer';

export interface SyntaxCheckResult {
  uri: vscode.Uri;
  diagnostics: vscode.Diagnostic[];
}

export interface SyntaxCheckStatus {
  state: 'idle' | 'checking' | 'complete' | 'scanning' | 'cancelled';
  fileName?: string;
  errorCount?: number;
  filesProcessed?: number;
  filesTotal?: number;
  cachedFiles?: number;
  durationMs?: number;
  message?: string;
}

interface CachedLightweightDiagnostics {
  mtimeMs: number;
  size: number;
  mode: 'full' | 'syntaxOnly';
  diagnostics: Array<{
    line: number;
    startChar: number;
    endChar: number;
    message: string;
    severity: vscode.DiagnosticSeverity;
  }>;
}

type DiagnosticMode = 'full' | 'syntaxOnly';
type DiagnosticOrigin = 'interactive' | 'background';
type ScanTrigger = 'change' | 'save' | 'open' | 'startup' | 'manual' | 'background';

interface ScanRequestOptions {
  mode: DiagnosticMode;
  trigger: ScanTrigger;
  immediate?: boolean;
  extraDelayMs?: number;
}

export class TclSyntaxChecker {
  private scanTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private checkGeneration: Map<string, number> = new Map();
  private lightweightDiagnosticsCache: Map<string, CachedLightweightDiagnostics> = new Map();
  private lastEmittedDiagnosticCounts: Map<string, number> = new Map();
  private lastEmittedDiagnosticModes: Map<string, DiagnosticMode> = new Map();
  private lastEmittedDiagnosticOrigins: Map<string, DiagnosticOrigin> = new Map();
  private backgroundScanTimeout: NodeJS.Timeout | undefined;
  private backgroundScanGeneration = 0;
  private backgroundScanCancelled = false;
  private backgroundScanActive = false;
  private readonly debounceMs: number = 500; // internal debounce before applying config delay
  private logChannel?: vscode.OutputChannel;
  private logFilePath?: string;
  private indexer?: TclIndexer;
  private readonly _onDidStatus = new vscode.EventEmitter<SyntaxCheckStatus>();
  public readonly onDidStatus = this._onDidStatus.event;
  
  constructor(indexer?: TclIndexer, logChannel?: vscode.OutputChannel, logFilePath?: string) {
    this.indexer = indexer;
    this.logChannel = logChannel;
    this.logFilePath = logFilePath;
  }

  private log(message: string): void {
    const line = `[Syntax Check] ${new Date().toLocaleTimeString()} ${message}`;
    if (this.logChannel) {
      this.logChannel.appendLine(line);
    }

    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, `${line}\n`, 'utf8');
      } catch {
        // ignore log file write failures during diagnostic tracing
      }
    }
  }

  public trace(message: string): void {
    this.log(message);
  }

  private setStatus(status: SyntaxCheckStatus): void {
    this._onDidStatus.fire(status);
  }

  private buildLightweightDiagnosticsFromText(
    text: string,
    uri: vscode.Uri,
    includeUsageAnalysis: boolean
  ): vscode.Diagnostic[] {
    const lines = text.split(/\r?\n/);
    const issues = collectLightweightSyntaxIssues(lines, { includeUsageAnalysis });
    return issues.map(issue => {
      const line = Math.max(0, Math.min(issue.line, Math.max(0, lines.length - 1)));
      const lineText = lines[line] || '';
      const hasTokenRange = Number.isInteger(issue.startChar) && Number.isInteger(issue.endChar) && (issue.endChar as number) > (issue.startChar as number);
      const startChar = hasTokenRange
        ? Math.max(0, Math.min(issue.startChar as number, lineText.length))
        : 0;
      const endChar = hasTokenRange
        ? Math.max(startChar + 1, Math.min(issue.endChar as number, Math.max(lineText.length, startChar + 1)))
        : Math.max(1, lineText.length);
      const range = new vscode.Range(line, startChar, line, endChar);
      const diagnostic = new vscode.Diagnostic(
        range,
        issue.message,
        issue.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
      );
      diagnostic.source = 'tcl-syntax';
      return diagnostic;
    });
  }

  private cacheLightweightDiagnostics(
    key: string,
    stat: vscode.FileStat,
    diagnostics: vscode.Diagnostic[],
    mode: 'full' | 'syntaxOnly'
  ): void {
    this.lightweightDiagnosticsCache.set(key, {
      mtimeMs: stat.mtime,
      size: stat.size,
      mode,
      diagnostics: diagnostics.map(d => ({
        line: d.range.start.line,
        startChar: d.range.start.character,
        endChar: d.range.end.character,
        message: d.message,
        severity: d.severity,
      })),
    });
  }

  private logDiagnosticDelta(
    label: string,
    key: string,
    nextDiagnostics: vscode.Diagnostic[]
  ): void {
    const cached = this.lightweightDiagnosticsCache.get(key);
    if (!cached) {
      this.log(`${label}: no previous cached diagnostics`);
      return;
    }

    const previousCount = cached.diagnostics.length;
    const nextCount = nextDiagnostics.length;
    const removed = Math.max(0, previousCount - nextCount);
    const added = Math.max(0, nextCount - previousCount);

    if (removed > 0) {
      this.log(`${label}: removed ${removed} diagnostic(s) (from ${previousCount} to ${nextCount})`);
    }

    if (added > 0) {
      this.log(`${label}: added ${added} diagnostic(s) (from ${previousCount} to ${nextCount})`);
    }

    if (removed === 0 && added === 0) {
      this.log(`${label}: diagnostic count unchanged at ${nextCount}`);
    }
  }

  private applyDiagnostics(
    label: string,
    key: string,
    uri: vscode.Uri,
    diagnosticCollection: vscode.DiagnosticCollection,
    diagnostics: vscode.Diagnostic[],
    mode: DiagnosticMode
  ): void {
    const previousCount = this.lastEmittedDiagnosticCounts.get(key);
    const nextCount = diagnostics.length;
    const previousMode = this.lastEmittedDiagnosticModes.get(key);
    const previousOrigin = this.lastEmittedDiagnosticOrigins.get(key);
    const previousModeLabel = previousMode ?? 'none';
    const action = mode === 'syntaxOnly' && previousMode === 'full' ? 'skip' : 'write';
    const currentOrigin: DiagnosticOrigin = label.startsWith('Background') ? 'background' : 'interactive';

    this.log(
      `${label}: emit key=${key} uri=${uri.fsPath} mode=${mode} origin=${currentOrigin} previousMode=${previousModeLabel} previousOrigin=${previousOrigin ?? 'none'} previousCount=${previousCount ?? 0} nextCount=${nextCount} action=${action}`
    );

    // Background syntax-only scans are intentionally less strict than full
    // interactive lightweight checks. Do not let them erase richer results.
    if (
      currentOrigin === 'background' &&
      previousOrigin === 'interactive' &&
      mode === 'syntaxOnly' &&
      (previousCount ?? 0) > 0
    ) {
      this.log(`${label}: preserving previous full diagnostics; skipping syntax-only overwrite (${previousCount ?? 0} -> ${nextCount})`);
      return;
    }

    if (previousCount === undefined) {
      this.log(`${label}: no previous emitted diagnostics; writing ${nextCount} diagnostic(s)`);
    } else {
      const removed = Math.max(0, previousCount - nextCount);
      const added = Math.max(0, nextCount - previousCount);

      if (removed > 0) {
        this.log(`${label}: removed ${removed} diagnostic(s) (from ${previousCount} to ${nextCount})`);
      }

      if (added > 0) {
        this.log(`${label}: added ${added} diagnostic(s) (from ${previousCount} to ${nextCount})`);
      }

      if (removed === 0 && added === 0) {
        this.log(`${label}: diagnostic count unchanged at ${nextCount}`);
      }
    }

    diagnosticCollection.set(uri, diagnostics);
    this.lastEmittedDiagnosticCounts.set(key, nextCount);
    this.lastEmittedDiagnosticModes.set(key, mode);
    this.lastEmittedDiagnosticOrigins.set(key, currentOrigin);
  }

  private restoreCachedLightweightDiagnostics(
    key: string,
    expectedMode: 'full' | 'syntaxOnly'
  ): vscode.Diagnostic[] | undefined {
    const cached = this.lightweightDiagnosticsCache.get(key);
    if (!cached || cached.mode !== expectedMode) {
      return undefined;
    }

    return cached.diagnostics.map(entry => {
      const line = Math.max(0, entry.line);
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(line, Math.max(0, entry.startChar), line, Math.max(Math.max(0, entry.startChar) + 1, entry.endChar)),
        entry.message,
        entry.severity
      );
      diagnostic.source = 'tcl-syntax';
      return diagnostic;
    });
  }

  /**
   * Check syntax of a TCL document using tclsh
   * @param document The document to check
   * @returns Array of diagnostics with errors
   */
  async checkSyntax(document: vscode.TextDocument): Promise<SyntaxCheckResult> {
    const config = vscode.workspace.getConfiguration('tcl.runtime');
    const mode = config.get<string>('syntaxCheckMode', 'lightweight');
    
    this.log(`checkSyntax called for: ${document.fileName}`);
    this.log(`  Syntax check mode: ${mode}`);
    
    if (mode === 'lightweight') {
      this.log(`  Using lightweight pairing checker`);
      return this.checkLightweightSyntax(document);
    }
    
    if (mode === 'local') {
      this.log(`  Using local external checker for syntax checking (replacing prior local tclsh behavior)`);
      return this.checkWithExternalScripts(document);
    } else if (mode === 'remote') {
      this.log(`  Using remote service for syntax checking`);
      return this.checkWithRemoteService(document);
    } else if (mode === 'external') {
      this.log(`  Using external script for syntax checking`);
      return this.checkWithExternalScripts(document);
    }
    
    this.log(`  Unknown syntax check mode, returning no diagnostics`);
    return { uri: document.uri, diagnostics: [] };
  }

  /**
   * Check syntax using local tclsh executable
   */
  private async checkWithLocalTclsh(document: vscode.TextDocument): Promise<SyntaxCheckResult> {
    const config = vscode.workspace.getConfiguration('tcl.runtime');
    const tclshPath = config.get<string>('tclshPath', 'tclsh');
    const importMode = config.get<string>('syntaxCheckImports', 'all');
    const fileName = document.fileName.split(/[\\/]/).pop() || document.fileName;
    
    this.log(`Starting syntax check for: ${fileName}`);
    this.log(`  Document URI: ${document.uri.toString()}`);
    this.log(`  Document file path: ${document.fileName}`);
    this.log(`  tclsh path setting: ${tclshPath}`);
    this.log(`  OS platform: ${process.platform}`);
    this.log(`  OS temp dir: ${os.tmpdir()}`);
    
    return new Promise(async (resolve) => {
      const tempDir = os.tmpdir();
      const timestamp = Date.now();
      const tempFile = path.join(tempDir, `vscode-tcl-check-${timestamp}.tcl`);
      const initFile = path.join(tempDir, `vscode-tcl-init-${timestamp}.tcl`);
      const wrapperFile = path.join(tempDir, `vscode-tcl-wrapper-${timestamp}.tcl`);
      
      this.log(`  Temp files:`);
      this.log(`    - tempFile: ${tempFile}`);
      this.log(`    - initFile: ${initFile}`);
      this.log(`    - wrapperFile: ${wrapperFile}`);
      
      try {
        // Write the document content that we want to check
        this.log(`  Writing document content to tempFile (${document.getText().length} bytes)`);
        fs.writeFileSync(tempFile, document.getText(), 'utf8');
        this.log(`  Successfully wrote tempFile`);
        
        // Find all TCL files in workspace to source before checking
        let sourceFiles: string[] = [];
        if (importMode === 'all') {
          this.log(`  Finding all TCL files in workspace...`);
          const allFiles = await vscode.workspace.findFiles('**/*.tcl');
          this.log(`  Found ${allFiles.length} total TCL files in workspace`);

          sourceFiles = allFiles
            .filter(file => file.toString() !== document.uri.toString()) // Exclude the file being checked
            .map(file => file.fsPath)
            .sort((a, b) => a.localeCompare(b));
          this.log(`  Will source ${sourceFiles.length} files (excluding current document)`);
        } else {
          this.log(`  Import preload mode is "${importMode}"; skipping workspace source preload`);
        }
        
        // Create initialization script that sources all project files
        const initScript = buildSyntaxInitScript(sourceFiles);
        this.log(`  Writing init script to initFile (${initScript.length} bytes)`);
        fs.writeFileSync(initFile, initScript, 'utf8');
        this.log(`  Successfully wrote initFile`);
        
        // Create wrapper script that sources init, then the document
        let wrapperScript = `try {\n`;
        wrapperScript += `  source "${initFile.replace(/\\/g, '/')}"\n`;
        wrapperScript += `  source "${tempFile.replace(/\\/g, '/')}"\n`;
        wrapperScript += `} on error {err} {\n`;
        wrapperScript += `  puts stderr $err\n`;
        wrapperScript += `  puts stderr $::errorInfo\n`;
        wrapperScript += `  exit 1\n`;
        wrapperScript += `}\n`;
        this.log(`  Writing wrapper script to wrapperFile (${wrapperScript.length} bytes)`);
        this.log(`  Wrapper script content:\n${wrapperScript}`);
        fs.writeFileSync(wrapperFile, wrapperScript, 'utf8');
        this.log(`  Successfully wrote wrapperFile`);
        
        // Run tclsh with the wrapper script
        const spawnOptions = {
          cwd: path.dirname(document.fileName),
          timeout: 5000
        };
        this.log(`  Spawning tclsh process:`);
        this.log(`    - Command: ${tclshPath}`);
        this.log(`    - Args: [${wrapperFile}]`);
        this.log(`    - CWD: ${spawnOptions.cwd}`);
        this.log(`    - Timeout: ${spawnOptions.timeout}ms`);
        
        const proc = child_process.spawn(tclshPath, [wrapperFile], spawnOptions);
        this.log(`  Process spawned with PID: ${proc.pid || 'unknown'}`);
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout?.on('data', (data) => {
          const chunk = data.toString();
          stdout += chunk;
          this.log(`  [STDOUT] Received ${chunk.length} bytes: ${chunk.substring(0, 100)}${chunk.length > 100 ? '...' : ''}`);
        });
        
        proc.stderr?.on('data', (data) => {
          const chunk = data.toString();
          stderr += chunk;
          this.log(`  [STDERR] Received ${chunk.length} bytes: ${chunk.substring(0, 200)}${chunk.length > 200 ? '...' : ''}`);
        });
        
        proc.on('error', (err) => {
          // tclsh not found or execution error
          this.log(`  [ERROR] Process error event: ${err.message}`);
          this.log(`    Error name: ${err.name}`);
          this.log(`    Error stack: ${err.stack}`);
          
          const diagnostic = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            `Failed to run tclsh: ${err.message}. Check tcl.runtime.tclshPath setting.`,
            vscode.DiagnosticSeverity.Error
          );
          diagnostic.source = 'tcl-syntax';
          
          // Clean up temp files
          this.log(`  Cleaning up temp files after error...`);
          try { fs.unlinkSync(tempFile); this.log(`    Deleted tempFile`); } catch (e) { this.log(`    Failed to delete tempFile: ${e}`); }
          try { fs.unlinkSync(initFile); this.log(`    Deleted initFile`); } catch (e) { this.log(`    Failed to delete initFile: ${e}`); }
          try { fs.unlinkSync(wrapperFile); this.log(`    Deleted wrapperFile`); } catch (e) { this.log(`    Failed to delete wrapperFile: ${e}`); }
          
          resolve({ uri: document.uri, diagnostics: [diagnostic] });
        });
        
        proc.on('close', (code) => {
          this.log(`  [CLOSE] Process exited with code: ${code}`);
          this.log(`    Total stdout length: ${stdout.length} bytes`);
          this.log(`    Total stderr length: ${stderr.length} bytes`);
          if (stderr.length > 0) {
            this.log(`    Full stderr content:\n${stderr}`);
          }
          
          // Clean up temp files
          this.log(`  Cleaning up temp files...`);
          try { fs.unlinkSync(tempFile); this.log(`    Deleted tempFile`); } catch (e) { this.log(`    Failed to delete tempFile: ${e}`); }
          try { fs.unlinkSync(initFile); this.log(`    Deleted initFile`); } catch (e) { this.log(`    Failed to delete initFile: ${e}`); }
          try { fs.unlinkSync(wrapperFile); this.log(`    Deleted wrapperFile`); } catch (e) { this.log(`    Failed to delete wrapperFile: ${e}`); }
          
          if (code === 0) {
            // No syntax errors
            this.log(`  Result: No syntax errors detected`);
            resolve({ uri: document.uri, diagnostics: [] });
            return;
          }
          
          // Parse error messages from stderr
          this.log(`  Parsing error output from stderr...`);
          const diagnostics = this.parseErrorOutput(stderr, document, {
            tempFile,
            initFile,
            wrapperFile,
          });
          this.log(`  Parsed ${diagnostics.length} diagnostic(s)`);
          diagnostics.forEach((d, idx) => {
            this.log(`    [${idx + 1}] Line ${d.range.start.line}: ${d.message.substring(0, 100)}`);
          });
          
          resolve({ uri: document.uri, diagnostics });
        });
        
      } catch (err: any) {
        // Clean up temp files on error
        this.log(`  [EXCEPTION] Caught exception: ${err.message}`);
        this.log(`    Exception name: ${err.name}`);
        this.log(`    Exception stack: ${err.stack}`);
        
        this.log(`  Cleaning up temp files after exception...`);
        try { fs.unlinkSync(tempFile); this.log(`    Deleted tempFile`); } catch (e) { this.log(`    Failed to delete tempFile: ${e}`); }
        try { fs.unlinkSync(initFile); this.log(`    Deleted initFile`); } catch (e) { this.log(`    Failed to delete initFile: ${e}`); }
        try { fs.unlinkSync(wrapperFile); this.log(`    Deleted wrapperFile`); } catch (e) { this.log(`    Failed to delete wrapperFile: ${e}`); }
        
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          `Syntax check error: ${err.message}`,
          vscode.DiagnosticSeverity.Error
        );
        diagnostic.source = 'tcl-syntax';
        resolve({ uri: document.uri, diagnostics: [diagnostic] });
      }
    });
  }

  /**
   * Check syntax using remote HTTP service
   */
  private async checkWithRemoteService(document: vscode.TextDocument): Promise<SyntaxCheckResult> {
    const config = vscode.workspace.getConfiguration('tcl.runtime');
    const remoteUrl = config.get<string>('remoteUrl', 'http://localhost:8765/check');
    
    try {
      // Use node's http/https modules
      const result = await this.httpPost(remoteUrl, {
        content: document.getText(),
        filename: document.fileName
      });
      
      // Expected format: { errors: [{ line: number, message: string, severity?: string }] }
      const diagnostics: vscode.Diagnostic[] = [];
      
      if (result.errors && Array.isArray(result.errors)) {
        for (const err of result.errors) {
          const line = Math.max(0, (err.line || 1) - 1); // Convert to 0-based
          const range = new vscode.Range(line, 0, line, 1000);
          const severity = err.severity === 'warning' 
            ? vscode.DiagnosticSeverity.Warning 
            : vscode.DiagnosticSeverity.Error;
          
          diagnostics.push(new vscode.Diagnostic(range, err.message, severity));
        }
      }
      
      const filtered = diagnostics.filter(d => !this.isDiagnosticSuppressed(document, d));
      return { uri: document.uri, diagnostics: filtered };
      
    } catch (err: any) {
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        `Remote syntax check failed: ${err.message}`,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.source = 'tcl-syntax';
      return { uri: document.uri, diagnostics: [diagnostic] };
    }
  }

  /**
   * Check syntax using an external checker script/executable which can output JSON
   */
  private async checkWithExternalScripts(document: vscode.TextDocument): Promise<SyntaxCheckResult> {
    const config = vscode.workspace.getConfiguration('tcl.runtime');
    const cmd = config.get<string>('externalCheckerCmd', 'tcl-check');
    const argsCfg = config.get<any>('externalCheckerArgs', ['--json']);

    // Ensure args is an array
    const baseArgs: string[] = Array.isArray(argsCfg) ? argsCfg.slice() : (typeof argsCfg === 'string' ? argsCfg.split(' ') : []);

    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const tempFile = path.join(tempDir, `vscode-tcl-external-${timestamp}.tcl`);

    try {
      fs.writeFileSync(tempFile, document.getText(), 'utf8');
    } catch (err: any) {
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        `Failed to write temp file for external checker: ${err.message}`,
        vscode.DiagnosticSeverity.Error
      );
      diagnostic.source = 'tcl-syntax';
      return { uri: document.uri, diagnostics: [diagnostic] };
    }

    const args = baseArgs.concat([tempFile]);

    this.log(`Spawning external checker: ${cmd} ${args.join(' ')}`);

    return new Promise((resolve) => {
      const spawnOptions = {
        cwd: path.dirname(document.fileName),
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024
      } as any;

      child_process.execFile(cmd, args, spawnOptions, (err, stdout, stderr) => {
        try {
          const stderrStr = stderr && typeof stderr !== 'string' ? stderr.toString() : (stderr || '');
          if (stderrStr.length > 0) {
            this.log(`External checker stderr: ${stderrStr.substring(0, 1000)}`);
          }

          const out = (stdout && typeof stdout !== 'string' ? stdout.toString() : (stdout || '')).trim();
          if (!out) {
            if (err) {
              this.log(`External checker failed: ${err.message}`);
              const diagnostic = new vscode.Diagnostic(
                new vscode.Range(0, 0, 0, 0),
                `External checker failed: ${err.message}`,
                vscode.DiagnosticSeverity.Warning
              );
              diagnostic.source = 'tcl-syntax';
              try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
              resolve({ uri: document.uri, diagnostics: [diagnostic] });
              return;
            }
            // No output and no error: no diagnostics
            try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
            resolve({ uri: document.uri, diagnostics: [] });
            return;
          }

          let parsed: any;
          try {
            parsed = JSON.parse(out);
          } catch (parseErr) {
            const parseMsg = (parseErr && typeof parseErr === 'object' && 'message' in parseErr) ? (parseErr as any).message : String(parseErr);
            this.log(`Failed to parse JSON from external checker: ${parseMsg}`);
            const diagnostic = new vscode.Diagnostic(
              new vscode.Range(0, 0, 0, 0),
              `External checker returned non-JSON output: ${parseMsg}`,
              vscode.DiagnosticSeverity.Warning
            );
            diagnostic.source = 'tcl-syntax';
            try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
            resolve({ uri: document.uri, diagnostics: [diagnostic] });
            return;
          }

          const diagnostics: vscode.Diagnostic[] = [];
          const errors = Array.isArray(parsed) ? parsed : (parsed.errors || parsed.results || []);

          if (Array.isArray(errors)) {
            for (const e of errors) {
              const line = Math.max(0, (e.line || 1) - 1);
              const range = new vscode.Range(line, 0, line, 1000);
              const severity = e.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
              const message = e.message || (typeof e === 'string' ? e : JSON.stringify(e));
              const diag = new vscode.Diagnostic(range, message, severity);
              diag.source = 'tcl-syntax';
              diagnostics.push(diag);
            }
          } else {
            // Unknown format: create a single diagnostic with raw output
            const diag = new vscode.Diagnostic(
              new vscode.Range(0, 0, 0, 0),
              `External checker returned unexpected JSON format`,
              vscode.DiagnosticSeverity.Warning
            );
            diag.source = 'tcl-syntax';
            diagnostics.push(diag);
          }

          try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
          const filtered = diagnostics.filter(d => !this.isDiagnosticSuppressed(document, d));
          resolve({ uri: document.uri, diagnostics: filtered });
        } catch (ex: any) {
          try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
          const diagnostic = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            `External checker exception: ${ex.message}`,
            vscode.DiagnosticSeverity.Error
          );
          diagnostic.source = 'tcl-syntax';
          resolve({ uri: document.uri, diagnostics: [diagnostic] });
        }
      });
    });
  }

  private async checkLightweightSyntax(document: vscode.TextDocument): Promise<SyntaxCheckResult> {
    const runtimeConfig = vscode.workspace.getConfiguration('tcl.runtime');
    const includeUsageAnalysis = runtimeConfig.get<boolean>('lightweightUsageAnalysis', false);
    let diagnostics = this.buildLightweightDiagnosticsFromText(document.getText(), document.uri, includeUsageAnalysis);

    // If we have an indexer, consult it to avoid false unused-proc warnings
    const procMsgRe = /^Possible unused proc:\s*(.+)$/;
    if (this.indexer) {
      const procDiags = diagnostics.filter(d => procMsgRe.test(d.message));
      if (procDiags.length) {
        const kept: vscode.Diagnostic[] = [];
        for (const pd of procDiags) {
          const m = pd.message.match(procMsgRe);
          const name = m ? m[1] : '';
          let used = false;
          try {
            // find references across the workspace respecting imports/namespaces
            const refs = await this.indexer.findProcMethodReferences(name, document);
            if (refs && refs.length > 0) used = true;
          } catch (e) {
            // if indexer fails, conservatively keep the warning
            used = false;
          }
          if (!used) kept.push(pd);
        }

        // Rebuild diagnostics: keep non-proc diagnostics + kept proc diagnostics
        diagnostics = diagnostics.filter(d => !procMsgRe.test(d.message)).concat(kept);
      }
    }

    const filtered = diagnostics.filter(d => !this.isDiagnosticSuppressedFromLines(document.getText().split(/\r?\n/), d));

    this.logDiagnosticDelta(`Lightweight check for ${document.fileName}`, document.uri.toString(), filtered);

    try {
      const stat = await vscode.workspace.fs.stat(document.uri);
      this.cacheLightweightDiagnostics(document.uri.toString(), stat, filtered, 'full');
    } catch {
      // ignore cache write failures for unsaved or inaccessible documents
    }

    return { uri: document.uri, diagnostics: filtered };
  }

  /**
   * Parse error output from tclsh and create diagnostics
   */
  private parseErrorOutput(
    errorText: string,
    document: vscode.TextDocument,
    runtimePaths?: { tempFile: string; initFile: string; wrapperFile: string }
  ): vscode.Diagnostic[] {
    this.log(`parseErrorOutput called`);
    this.log(`  Error text length: ${errorText?.length || 0} bytes`);
    this.log(`  Document line count: ${document.lineCount}`);
    
    const diagnostics: vscode.Diagnostic[] = [];
    
    if (!errorText || errorText.trim().length === 0) {
      this.log(`  Error text is empty, returning no diagnostics`);
      return diagnostics;
    }
    
    this.log(`  Full error text:\n${errorText}`);
    
    // TCL error patterns:
    // 1. "ERROR: <message>" - generic error
    // 2. "wrong # args: ..." - argument count errors
    // 3. "invalid command name ..." - unknown commands
    // 4. "extra characters after close-quote" - quote errors
    // 5. "missing close-brace" - brace errors
    // 6. Line references like "    (file \"...\" line X)"
    
    const lines = errorText.split(/\r?\n/);
    this.log(`  Split into ${lines.length} line(s)`);
    
    let currentError = '';
    let errorLine = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      this.log(`  Parsing line ${i + 1}: "${line}"`);
      
      // Check for line number references
      const lineMatch = line.match(/line (\d+)/i);
      if (lineMatch) {
        errorLine = parseInt(lineMatch[1], 10) - 1; // Convert to 0-based
        errorLine = Math.max(0, Math.min(errorLine, document.lineCount - 1));
        this.log(`    Found line reference: ${lineMatch[1]} (0-based: ${errorLine})`);
      }
      
      // Extract error message
      if (line.includes('ERROR:')) {
        currentError = line.replace(/^.*ERROR:\s*/, '').trim();
        this.log(`    Extracted error from ERROR: prefix: "${currentError}"`);
      } else if (line.trim().length > 0 && !line.includes('(file ') && !line.startsWith('    ')) {
        const prevError = currentError;
        currentError += (currentError ? ' ' : '') + line.trim();
        this.log(`    Appended to current error (was: "${prevError}", now: "${currentError}")`);
      } else {
        this.log(`    Skipped line (empty or metadata)`);
      }
    }
    
    this.log(`  Final parsed error: "${currentError}"`);
    this.log(`  Final error line: ${errorLine}`);
    
    const documentLines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      documentLines.push(document.lineAt(i).text);
    }
    
    if (currentError) {
      const severity = classifySyntaxSeverity(currentError) === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Error;

      const extracted = extractErrorMessageAndLine(errorText, document.lineCount);
      const preferredPaths: string[] = [document.fileName];
      if (runtimePaths) {
        preferredPaths.push(runtimePaths.tempFile);
      }

      const normalizePath = (value: string) => value.replace(/\\/g, '/').toLowerCase();

      const primaryFrame = selectPrimaryFrame(extracted.frames, preferredPaths);
      let targetLine = resolveTargetLine(extracted.message || currentError, extracted.fallbackLine, documentLines);
      let diagnosticMessage = currentError;

      if (primaryFrame && typeof primaryFrame.line === 'number') {
        targetLine = Math.max(0, Math.min(primaryFrame.line, Math.max(0, document.lineCount - 1)));
      }

      const isExternalFrame = !!(
        primaryFrame?.filePath &&
        !preferredPaths.some(p => normalizePath(primaryFrame.filePath!) === normalizePath(p))
      );
      if (isExternalFrame && primaryFrame?.filePath) {
        const sourcedFile = primaryFrame.filePath.split(/[\\/]/).pop() || primaryFrame.filePath;
        diagnosticMessage = `${currentError} (while sourcing ${sourcedFile})`;
      }

      const range = new vscode.Range(targetLine, 0, targetLine, 1000);
      const diagnostic = new vscode.Diagnostic(range, diagnosticMessage, severity);
      diagnostic.source = 'tcl-syntax';
      diagnostics.push(diagnostic);
      this.log(`  Created diagnostic at line ${targetLine}: "${currentError}"`);

      const secondaryFrames = extracted.frames.filter(frame => frame !== primaryFrame && frame.filePath);
      for (const frame of secondaryFrames) {
        const sourcedFile = frame.filePath!.split(/[\\/]/).pop() || frame.filePath!;
        const contextDiag = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          `Related source context: ${sourcedFile}:${frame.line + 1}`,
          vscode.DiagnosticSeverity.Warning
        );
        contextDiag.source = 'tcl-syntax';
        diagnostics.push(contextDiag);
      }
    }
    
    // If no specific error was parsed but we have error text, create a general error
    if (diagnostics.length === 0 && errorText.trim().length > 0) {
      this.log(`  No specific error parsed, creating general error diagnostic`);
      const cleanError = errorText.replace(/^.*ERROR:\s*/i, '').trim();
      const range = new vscode.Range(errorLine, 0, errorLine, 1000);
      const diagnostic = new vscode.Diagnostic(range, cleanError, vscode.DiagnosticSeverity.Error);
      diagnostic.source = 'tcl-syntax';
      diagnostics.push(diagnostic);
      this.log(`  Created general error diagnostic: "${cleanError}"`);
    }
    
    const beforeCount = diagnostics.length;
    const filtered = diagnostics.filter(d => !this.isDiagnosticSuppressed(document, d));
    this.log(`  Returning ${filtered.length} diagnostic(s) (filtered ${beforeCount - filtered.length})`);
    return filtered;
  }

  /**
   * Unified scan request path for full and lightweight checks.
   */
  private requestScan(
    document: vscode.TextDocument,
    diagnosticCollection: vscode.DiagnosticCollection,
    options: ScanRequestOptions
  ): void {
    const key = document.uri.toString();
    if (this.scanTimeouts.has(key)) {
      clearTimeout(this.scanTimeouts.get(key)!);
      this.scanTimeouts.delete(key);
    }

    const immediate = options.immediate === true;
    const profileLabel = options.mode === 'syntaxOnly' ? 'lightweight' : 'full';

    // Every request increments generation so only the newest request writes diagnostics.
    const gen = (this.checkGeneration.get(key) || 0) + 1;
    this.checkGeneration.set(key, gen);
    this.log(
      `Scheduling ${profileLabel} scan for ${document.fileName}: trigger=${options.trigger} immediate=${immediate} generation=${gen}`
    );

    const expectedGen = gen;
    const doCheck = async () => {
      const fileName = document.fileName.split(/[\/]/).pop() || document.fileName;
      this.setStatus({ state: 'checking', fileName });
      this.log(`Checking ${profileLabel} syntax: ${fileName}`);
      const result = options.mode === 'syntaxOnly'
        ? await this.checkLightweightSyntax(document)
        : await this.checkSyntax(document);
      const currentGen = this.checkGeneration.get(key) || 0;
      if (currentGen !== expectedGen) {
        this.log(
          `Dropping stale ${profileLabel} scan results for ${fileName} (gen ${expectedGen} != current ${currentGen})`
        );
        return;
      }

      const labelPrefix = options.mode === 'syntaxOnly' ? 'Lightweight check' : 'Full check';
      this.applyDiagnostics(
        `${labelPrefix} for ${document.fileName}`,
        key,
        result.uri,
        diagnosticCollection,
        result.diagnostics,
        options.mode
      );
      const errorCount = result.diagnostics.length;
      const status = errorCount === 0 ? 'OK' : `${errorCount} issue(s)`;
      this.log(`${profileLabel} syntax check complete: ${fileName} - ${status}`);
      this.setStatus({ state: 'complete', fileName, errorCount });
    };

    if (immediate) {
      doCheck();
    } else {
      const totalDelayMs = this.debounceMs + (options.extraDelayMs || 0);
      const to = setTimeout(doCheck, totalDelayMs);
      this.scanTimeouts.set(key, to);
    }
  }

  /**
   * Schedule a configured/full syntax check (immediate on save/open, delayed on change)
   */
  scheduleCheck(
    document: vscode.TextDocument,
    diagnosticCollection: vscode.DiagnosticCollection,
    immediate: boolean = false,
    trigger?: ScanTrigger
  ): void {
    const config = vscode.workspace.getConfiguration('tcl.runtime');
    const delaySeconds = config.get<number>('syntaxCheckDelay', 10);
    const delayMs = Math.max(1000, delaySeconds * 1000);
    const resolvedTrigger = trigger ?? (immediate ? 'save' : 'change');
    this.requestScan(document, diagnosticCollection, {
      mode: 'full',
      trigger: resolvedTrigger,
      immediate,
      extraDelayMs: immediate ? 0 : delayMs,
    });
  }

  scheduleLightweightCheck(
    document: vscode.TextDocument,
    diagnosticCollection: vscode.DiagnosticCollection,
    immediate: boolean = false,
    trigger?: ScanTrigger
  ): void {
    const resolvedTrigger = trigger ?? (immediate ? 'save' : 'change');
    this.requestScan(document, diagnosticCollection, {
      mode: 'syntaxOnly',
      trigger: resolvedTrigger,
      immediate,
      extraDelayMs: 0,
    });
  }

  /**
   * Clear any pending check
   */
  clearScheduledCheck(): void {
    for (const [, to] of this.scanTimeouts.entries()) {
      try { clearTimeout(to); } catch { /* ignore */ }
    }
    this.scanTimeouts.clear();
    this.checkGeneration.clear();
  }

  startBackgroundLightweightScan(diagnosticCollection: vscode.DiagnosticCollection): void {
    if (this.backgroundScanActive) {
      this.log('Background lightweight scan already active; skipping duplicate start');
      return;
    }

    this.backgroundScanCancelled = false;
    this.backgroundScanActive = true;
    const scanGeneration = ++this.backgroundScanGeneration;
    const startedAt = Date.now();

    const run = async () => {
      try {
        const files = await vscode.workspace.findFiles('**/*.tcl');
        const sortedFiles = files.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
        const totalFiles = sortedFiles.length;
        let processedFiles = 0;
        let cachedFiles = 0;
        const batchSize = 25;

        this.log(`Starting background lightweight scan for ${totalFiles} file(s)`);
        this.setStatus({
          state: 'scanning',
          message: 'Scanning workspace for syntax issues',
          filesProcessed: 0,
          filesTotal: totalFiles,
          cachedFiles: 0,
        });

        for (let i = 0; i < sortedFiles.length; i += batchSize) {
          if (this.backgroundScanCancelled || scanGeneration !== this.backgroundScanGeneration) {
            this.log(`Background scan cancelled at file ${processedFiles}/${totalFiles}`);
            this.setStatus({
              state: 'cancelled',
              message: 'Syntax scan cancelled',
              filesProcessed: processedFiles,
              filesTotal: totalFiles,
              cachedFiles,
              durationMs: Date.now() - startedAt,
            });
            return;
          }

          const batch = sortedFiles.slice(i, i + batchSize);
          for (const uri of batch) {
            if (this.backgroundScanCancelled || scanGeneration !== this.backgroundScanGeneration) break;

            const key = uri.toString();
            try {
              const stat = await vscode.workspace.fs.stat(uri);
              const cached = this.lightweightDiagnosticsCache.get(key);
              if (cached && cached.mtimeMs === stat.mtime && cached.size === stat.size) {
                const restored = this.restoreCachedLightweightDiagnostics(key, 'syntaxOnly');
                if (restored) {
                  this.applyDiagnostics(`Background restore for ${uri.fsPath}`, key, uri, diagnosticCollection, restored, 'syntaxOnly');
                  cachedFiles++;
                  processedFiles++;
                  continue;
                }
              }

              const raw = await vscode.workspace.fs.readFile(uri);
              const text = new TextDecoder('utf-8').decode(raw);
              const diagnostics = this.buildLightweightDiagnosticsFromText(text, uri, false)
                .filter(d => !this.isDiagnosticSuppressedFromLines(text.split(/\r?\n/), d));

              this.applyDiagnostics(`Background scan for ${uri.fsPath}`, key, uri, diagnosticCollection, diagnostics, 'syntaxOnly');
              this.cacheLightweightDiagnostics(key, stat, diagnostics, 'syntaxOnly');
              processedFiles++;
            } catch (err: any) {
              this.log(`Background scan failed for ${uri.fsPath}: ${err?.message || err}`);
              processedFiles++;
            }
          }

          this.setStatus({
            state: 'scanning',
            message: 'Scanning workspace for syntax issues',
            filesProcessed: processedFiles,
            filesTotal: totalFiles,
            cachedFiles,
          });

          await new Promise(resolve => setTimeout(resolve, 0));
        }

        const durationMs = Date.now() - startedAt;
        this.log(`Completed background lightweight scan: ${processedFiles}/${totalFiles} file(s) in ${durationMs}ms (cached ${cachedFiles})`);
        this.setStatus({
          state: 'complete',
          message: 'Background syntax scan complete',
          filesProcessed: processedFiles,
          filesTotal: totalFiles,
          cachedFiles,
          durationMs,
        });
      } finally {
        this.backgroundScanActive = false;
      }
    };

    void run();
  }

  cancelBackgroundLightweightScan(): void {
    if (!this.backgroundScanActive) {
      this.log('No background lightweight scan is active');
      return;
    }

    this.backgroundScanCancelled = true;
    this.backgroundScanGeneration++;
    if (this.backgroundScanTimeout) {
      try { clearTimeout(this.backgroundScanTimeout); } catch { /* ignore */ }
      this.backgroundScanTimeout = undefined;
    }
    this.setStatus({
      state: 'cancelled',
      message: 'Syntax scan cancelled',
    });
    this.log('Background lightweight scan cancelled by user');
  }

  /**
   * Make HTTP POST request
   */
  private httpPost(url: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const postData = JSON.stringify(data);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 10000
      };
      
      const req = httpModule.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(responseData);
            resolve(jsonData);
          } catch (err) {
            reject(new Error('Invalid JSON response from server'));
          }
        });
      });
      
      req.on('error', (err) => {
        reject(err);
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(postData);
      req.end();
    });
  }

  /**
   * Determine if a diagnostic is suppressed by file- or line-level suppression comments.
   * Supports:
   *  - file-level: '# tcl-ignore-file' (anywhere in first 50 lines)
   *  - line-level: '# tcl-ignore' appended on the same line or on the previous line
   */
  private isDiagnosticSuppressed(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): boolean {
    return this.isDiagnosticSuppressedFromLines(
      Array.from({ length: document.lineCount }, (_, index) => document.lineAt(index).text),
      diagnostic
    );
  }

  private isDiagnosticSuppressedFromLines(lines: string[], diagnostic: vscode.Diagnostic): boolean {
    try {
      // Determine diagnostic level string
      const diagLevel = (diagnostic && typeof diagnostic.severity === 'number' && diagnostic.severity === vscode.DiagnosticSeverity.Warning)
        ? 'warning' : 'error';

      // File-level suppression: check first 50 lines and respect level
      const headLines = Math.min(50, lines.length);
      for (let i = 0; i < headLines; i++) {
        const txt = lines[i];
        const m = txt.match(/#\s*tcl-ignore-file(?::(error|warning|all))?\b/i);
        if (m) {
          const token = (m[1] || 'all').toLowerCase();
          if (token === 'all' || token === diagLevel) return true;
        }
      }

      const line = Math.max(0, Math.min(diagnostic.range.start.line, Math.max(0, lines.length - 1)));

      // Same-line suppression
      const lineText = lines[line] || '';
      const ms = lineText.match(/#\s*tcl-ignore(?::(error|warning|all))?\b/i);
      if (ms) {
        const token = (ms[1] || 'all').toLowerCase();
        if (token === 'all' || token === diagLevel) return true;
      }

      // Previous-line suppression (comment above the line)
      if (line > 0) {
        const prevText = lines[line - 1] || '';
        const mp = prevText.match(/#\s*tcl-ignore(?::(error|warning|all))?\b/i);
        if (mp) {
          const token = (mp[1] || 'all').toLowerCase();
          if (token === 'all' || token === diagLevel) return true;
        }
      }

      return false;
    } catch (e) {
      return false;
    }
  }
}
