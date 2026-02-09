#!/usr/bin/env python3
"""
Debug version of TCL Syntax Server with verbose logging
"""

import sys
import subprocess
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import tempfile
import os
import logging

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
TCLSH_PATH = os.environ.get('TCLSH_PATH', 'tclsh')

class TclSyntaxHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/check':
            logger.warning(f"Invalid path requested: {self.path}")
            self.send_response(404)
            self.end_headers()
            return
            
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            
            logger.info(f"Received request with {len(body)} bytes")
            logger.debug(f"Script content:\n{body[:200]}...")
            
            # Write script to temp file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.tcl', delete=False) as f:
                f.write(body)
                script_file = f.name
            
            logger.info(f"Temp script file: {script_file}")
            
            try:
                # Run tclsh with the script
                logger.info(f"Running: {TCLSH_PATH} {script_file}")
                result = subprocess.run(
                    [TCLSH_PATH, script_file],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                logger.info(f"Exit code: {result.returncode}")
                if result.stdout:
                    logger.debug(f"stdout: {result.stdout[:200]}")
                if result.stderr:
                    logger.debug(f"stderr: {result.stderr[:200]}")
                
                response = {
                    'success': result.returncode == 0,
                    'stdout': result.stdout,
                    'stderr': result.stderr,
                    'exitCode': result.returncode
                }
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                response_json = json.dumps(response)
                logger.info(f"Sending response: {response_json[:200]}...")
                self.wfile.write(response_json.encode('utf-8'))
                
            finally:
                # Cleanup temp file
                try:
                    os.unlink(script_file)
                    logger.debug(f"Cleaned up temp file: {script_file}")
                except Exception as e:
                    logger.warning(f"Failed to clean up temp file: {e}")
                    
        except Exception as e:
            logger.error(f"Error processing request: {e}", exc_info=True)
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
    
    def log_message(self, format, *args):
        # Route HTTP logs through logger
        logger.info("%s - - [%s] %s" % (
            self.address_string(),
            self.log_date_time_string(),
            format % args
        ))

if __name__ == '__main__':
    logger.info(f"Starting TCL Syntax Server on port {PORT}")
    logger.info(f"Using tclsh: {TCLSH_PATH}")
    logger.info(f"TCLLIBPATH: {os.environ.get('TCLLIBPATH', 'not set')}")
    
    server = HTTPServer(('0.0.0.0', PORT), TclSyntaxHandler)
    logger.info("Server started. Press Ctrl+C to stop.")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down server...")
        server.shutdown()
