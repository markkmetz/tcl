import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

export interface SyntaxCheckResult {
  uri: vscode.Uri;
  diagnostics: vscode.Diagnostic[];
}

export class TclSyntaxChecker {
  private checkTimeout: NodeJS.Timeout | undefined;
  private readonly debounceMs: number = 500; // internal debounce before applying config delay
  
  constructor() {}

  /**
   * Check syntax of a TCL document using tclsh
   * @param document The document to check
   * @returns Array of diagnostics with errors
   */
  async checkSyntax(document: vscode.TextDocument): Promise<SyntaxCheckResult> {
    const config = vscode.workspace.getConfiguration('tcl.runtime');
    const mode = config.get<string>('syntaxCheckMode', 'local');
    
    if (mode === 'disabled') {
      return { uri: document.uri, diagnostics: [] };
    }
    
    if (mode === 'local') {
      return this.checkWithLocalTclsh(document);
    } else if (mode === 'remote') {
      return this.checkWithRemoteService(document);
    }
    
    return { uri: document.uri, diagnostics: [] };
  }

  /**
   * Check syntax using local tclsh executable
   */
  private async checkWithLocalTclsh(document: vscode.TextDocument): Promise<SyntaxCheckResult> {
    const config = vscode.workspace.getConfiguration('tcl.runtime');
    const tclshPath = config.get<string>('tclshPath', 'tclsh');
    
    return new Promise((resolve) => {
      // Create a temporary file with the document content
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `vscode-tcl-check-${Date.now()}.tcl`);
      
      try {
        // Write document content to temp file
        fs.writeFileSync(tempFile, document.getText(), 'utf8');
        
        // Run tclsh with the temp file directly
        const proc = child_process.spawn(tclshPath, [tempFile], {
          cwd: path.dirname(document.fileName),
          timeout: 5000
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
        });
        
        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
        
        proc.on('error', (err) => {
          // tclsh not found or execution error
          const diagnostic = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            `Failed to run tclsh: ${err.message}. Check tcl.runtime.tclshPath setting.`,
            vscode.DiagnosticSeverity.Error
          );
          
          // Clean up temp file
          try { fs.unlinkSync(tempFile); } catch {}
          
          resolve({ uri: document.uri, diagnostics: [diagnostic] });
        });
        
        proc.on('close', (code) => {
          // Clean up temp file
          try { fs.unlinkSync(tempFile); } catch {}
          
          if (code === 0) {
            // No syntax errors
            resolve({ uri: document.uri, diagnostics: [] });
            return;
          }
          
          // Parse error messages from stderr
          const diagnostics = this.parseErrorOutput(stderr, document);
          resolve({ uri: document.uri, diagnostics });
        });
        
      } catch (err: any) {
        // Clean up temp file on error
        try { fs.unlinkSync(tempFile); } catch {}
        
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          `Syntax check error: ${err.message}`,
          vscode.DiagnosticSeverity.Error
        );
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
      return { uri: document.uri, diagnostics: [diagnostic] };
    }
  }

  /**
   * Parse error output from tclsh and create diagnostics
   */
  private parseErrorOutput(errorText: string, document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    
    if (!errorText || errorText.trim().length === 0) {
      return diagnostics;
    }
    
    // TCL error patterns:
    // 1. "ERROR: <message>" - generic error
    // 2. "wrong # args: ..." - argument count errors
    // 3. "invalid command name ..." - unknown commands
    // 4. "extra characters after close-quote" - quote errors
    // 5. "missing close-brace" - brace errors
    // 6. Line references like "    (file \"...\" line X)"
    
    const lines = errorText.split(/\r?\n/);
    let currentError = '';
    let errorLine = 0;
    
    for (const line of lines) {
      // Check for line number references
      const lineMatch = line.match(/line (\d+)/i);
      if (lineMatch) {
        errorLine = parseInt(lineMatch[1], 10) - 1; // Convert to 0-based
        errorLine = Math.max(0, Math.min(errorLine, document.lineCount - 1));
      }
      
      // Extract error message
      if (line.includes('ERROR:')) {
        currentError = line.replace(/^.*ERROR:\s*/, '').trim();
      } else if (line.trim().length > 0 && !line.includes('(file ') && !line.startsWith('    ')) {
        currentError += (currentError ? ' ' : '') + line.trim();
      }
    }
    
    // Common TCL error patterns that can be detected
    const errorPatterns = [
      { pattern: /wrong # args/i, severity: vscode.DiagnosticSeverity.Error },
      { pattern: /invalid command name/i, severity: vscode.DiagnosticSeverity.Error },
      { pattern: /extra characters after close-quote/i, severity: vscode.DiagnosticSeverity.Error },
      { pattern: /missing close-brace/i, severity: vscode.DiagnosticSeverity.Error },
      { pattern: /missing close-bracket/i, severity: vscode.DiagnosticSeverity.Error },
      { pattern: /unmatched open brace/i, severity: vscode.DiagnosticSeverity.Error },
      { pattern: /can't read ".*": no such variable/i, severity: vscode.DiagnosticSeverity.Warning },
    ];
    
    if (currentError) {
      let severity = vscode.DiagnosticSeverity.Error;
      
      // Determine severity based on error pattern
      for (const ep of errorPatterns) {
        if (ep.pattern.test(currentError)) {
          severity = ep.severity;
          break;
        }
      }
      
      // Try to find a more specific line number by scanning the document
      let targetLine = errorLine;
      
      // For brace/bracket errors, try to find the actual problematic line
      if (/missing close-brace|unmatched open brace/i.test(currentError)) {
        targetLine = this.findBraceError(document);
      } else if (/missing close-bracket/i.test(currentError)) {
        targetLine = this.findBracketError(document);
      } else if (/extra characters after close-quote/i.test(currentError)) {
        targetLine = this.findQuoteError(document);
      }
      
      if (targetLine === -1) {
        targetLine = errorLine;
      }
      
      const range = new vscode.Range(targetLine, 0, targetLine, 1000);
      diagnostics.push(new vscode.Diagnostic(range, currentError, severity));
    }
    
    // If no specific error was parsed but we have error text, create a general error
    if (diagnostics.length === 0 && errorText.trim().length > 0) {
      const cleanError = errorText.replace(/^.*ERROR:\s*/i, '').trim();
      const range = new vscode.Range(errorLine, 0, errorLine, 1000);
      diagnostics.push(new vscode.Diagnostic(range, cleanError, vscode.DiagnosticSeverity.Error));
    }
    
    return diagnostics;
  }

  /**
   * Find line with unclosed brace
   */
  private findBraceError(document: vscode.TextDocument): number {
    let depth = 0;
    let lastOpenLine = -1;
    
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        
        // Skip strings
        if (ch === '"') {
          const closeQuote = line.indexOf('"', j + 1);
          if (closeQuote !== -1) {
            j = closeQuote;
            continue;
          }
        }
        
        if (ch === '{') {
          depth++;
          lastOpenLine = i;
        } else if (ch === '}') {
          depth--;
          if (depth < 0) {
            return i; // Extra closing brace
          }
        }
      }
    }
    
    // If depth > 0, return the last line with an opening brace
    if (depth > 0 && lastOpenLine !== -1) {
      return lastOpenLine;
    }
    
    return -1;
  }

  /**
   * Find line with unclosed bracket
   */
  private findBracketError(document: vscode.TextDocument): number {
    let depth = 0;
    let lastOpenLine = -1;
    
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        
        // Skip strings
        if (ch === '"') {
          const closeQuote = line.indexOf('"', j + 1);
          if (closeQuote !== -1) {
            j = closeQuote;
            continue;
          }
        }
        
        if (ch === '[') {
          depth++;
          lastOpenLine = i;
        } else if (ch === ']') {
          depth--;
          if (depth < 0) {
            return i; // Extra closing bracket
          }
        }
      }
    }
    
    // If depth > 0, return the last line with an opening bracket
    if (depth > 0 && lastOpenLine !== -1) {
      return lastOpenLine;
    }
    
    return -1;
  }

  /**
   * Find line with quote error
   */
  private findQuoteError(document: vscode.TextDocument): number {
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      let inQuote = false;
      
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '"') {
          inQuote = !inQuote;
        }
      }
      
      // If line ends with open quote, check if there are extra characters
      if (inQuote) {
        return i;
      }
    }
    
    return -1;
  }

  /**
   * Schedule a syntax check with debouncing
   */
  scheduleCheck(
    document: vscode.TextDocument,
    diagnosticCollection: vscode.DiagnosticCollection
  ): void {
    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
    }
    
    const config = vscode.workspace.getConfiguration('tcl.runtime');
    const delaySeconds = config.get<number>('syntaxCheckDelay', 10);
    const delayMs = Math.max(1000, delaySeconds * 1000); // At least 1 second
    
    this.checkTimeout = setTimeout(async () => {
      const result = await this.checkSyntax(document);
      diagnosticCollection.set(result.uri, result.diagnostics);
    }, this.debounceMs + delayMs);
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
