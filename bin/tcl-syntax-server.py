#!/usr/bin/env python3
"""
TCL Syntax Check Server
Run this in your container to provide syntax checking via HTTP.

Usage:
    python3 tcl-syntax-server.py [port]
    
Default port: 8765

Example with dependencies:
    export TCLLIBPATH="/path/to/your/tcl/libs"
    python3 tcl-syntax-server.py 8765
"""

import sys
import subprocess
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import tempfile
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
TCLSH_PATH = os.environ.get('TCLSH_PATH', 'tclsh')

class TclSyntaxHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/check':
            self.send_response(404)
            self.end_headers()
            return
            
        try:
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length).decode('utf-8')
            
            # Write script to temp file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.tcl', delete=False) as f:
                f.write(body)
                script_file = f.name
            
            try:
                # Run tclsh with the script
                result = subprocess.run(
                    [TCLSH_PATH, script_file],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                response = {
                    'success': result.returncode == 0,
                    'stdout': result.stdout,
                    'stderr': result.stderr,
                    'exitCode': result.returncode
                }
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            finally:
                # Cleanup temp file
                try:
                    os.unlink(script_file)
                except:
                    pass
                    
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
    
    def log_message(self, format, *args):
        # Customize logging or suppress
        sys.stdout.write("%s - - [%s] %s\n" %
                        (self.address_string(),
                         self.log_date_time_string(),
                         format % args))

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', PORT), TclSyntaxHandler)
    print(f"TCL Syntax Server listening on port {PORT}")
    print(f"Using tclsh: {TCLSH_PATH}")
    print(f"TCLLIBPATH: {os.environ.get('TCLLIBPATH', 'not set')}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.shutdown()
