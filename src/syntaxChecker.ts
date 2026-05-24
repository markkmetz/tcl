import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import {
  buildSyntaxInitScript,
  classifySyntaxSeverity,
  extractErrorMessageAndLine,
  resolveTargetLine,
  selectPrimaryFrame,
} from './syntaxCheckerUtils';

export interface SyntaxCheckResult {
  uri: vscode.Uri;
  diagnostics: vscode.Diagnostic[];
}

export interface SyntaxCheckStatus {
  state: 'idle' | 'checking' | 'complete';
  fileName?: string;
  errorCount?: number;
}

export class TclSyntaxChecker {
  private checkTimeout: NodeJS.Timeout | undefined;
  private readonly debounceMs: number = 500; // internal debounce before applying config delay
  private logChannel?: vscode.OutputChannel;
  private readonly _onDidStatus = new vscode.EventEmitter<SyntaxCheckStatus>();
  public readonly onDidStatus = this._onDidStatus.event;
  
  constructor(logChannel?: vscode.OutputChannel) {
    this.logChannel = logChannel;
  }

  private log(message: string): void {
    if (this.logChannel) {
      this.logChannel.appendLine(`[Syntax Check] ${new Date().toLocaleTimeString()} ${message}`);
    }
  }

  private setStatus(status: SyntaxCheckStatus): void {
    this._onDidStatus.fire(status);
  }

  /**
   * Check syntax of a TCL document using tclsh
   * @param document The document to check
   * @returns Array of diagnostics with errors
   */
  async checkSyntax(document: vscode.TextDocument): Promise<SyntaxCheckResult> {
    const config = vscode.workspace.getConfiguration('tcl.runtime');
    const mode = config.get<string>('syntaxCheckMode', 'local');
    
    this.log(`checkSyntax called for: ${document.fileName}`);
    this.log(`  Syntax check mode: ${mode}`);
    
    if (mode === 'disabled') {
      this.log(`  Syntax checking is disabled, returning no diagnostics`);
      return { uri: document.uri, diagnostics: [] };
    }
    
    if (mode === 'local') {
      this.log(`  Using local tclsh for syntax checking`);
      return this.checkWithLocalTclsh(document);
    } else if (mode === 'remote') {
      this.log(`  Using remote service for syntax checking`);
      return this.checkWithRemoteService(document);
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
      
      return { uri: document.uri, diagnostics };
      
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
    
    this.log(`  Returning ${diagnostics.length} diagnostic(s)`);
    return diagnostics;
  }

  /**
   * Schedule a syntax check (immediate on save, debounced on change)
   */
  scheduleCheck(
    document: vscode.TextDocument,
    diagnosticCollection: vscode.DiagnosticCollection,
    immediate: boolean = false
  ): void {
    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
    }
    
    const doCheck = async () => {
      const fileName = document.fileName.split(/[\\/]/).pop() || document.fileName;
      this.setStatus({ state: 'checking', fileName });
      this.log(`Checking syntax: ${fileName}`);
      const result = await this.checkSyntax(document);
      diagnosticCollection.set(result.uri, result.diagnostics);
      const errorCount = result.diagnostics.length;
      const status = errorCount === 0 ? 'OK' : `${errorCount} error(s)`;
      this.log(`Syntax check complete: ${fileName} - ${status}`);
      this.setStatus({ state: 'complete', fileName, errorCount });
    };
    
    if (immediate) {
      // On save: check immediately
      doCheck();
    } else {
      // On change: debounce (though we're not using this anymore)
      const config = vscode.workspace.getConfiguration('tcl.runtime');
      const delaySeconds = config.get<number>('syntaxCheckDelay', 10);
      const delayMs = Math.max(1000, delaySeconds * 1000);
      this.checkTimeout = setTimeout(doCheck, this.debounceMs + delayMs);
    }
  }

  /**
   * Clear any pending check
   */
  clearScheduledCheck(): void {
    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
      this.checkTimeout = undefined;
    }
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
}
