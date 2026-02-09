# Testing TCL Syntax Server Locally

## Quick Start (No Docker)

### Step 1: Check if tclsh is installed
```bash
which tclsh
tclsh
# Inside tclsh: puts "hello"
# Type: exit
```

### Step 2: Start the debug server (Terminal 1)
```bash
cd /home/markkmetz/Documents/tcl/bin
python3 tcl-syntax-server-debug.py 8765
```

You should see:
```
2026-02-08 ... - Starting TCL Syntax Server on port 8765
2026-02-08 ... - Using tclsh: tclsh
2026-02-08 ... - Server started. Press Ctrl+C to stop.
```

### Step 3: Run tests (Terminal 2)
```bash
cd /home/markkmetz/Documents/tcl/bin
chmod +x test-server.sh
./test-server.sh
```

This runs 4 tests:
1. Valid script (should return `"success":true`)
2. Invalid command (should return error in `stderr`)
3. Error on specific line (should show line number)
4. Namespace test (complex TCL)

### Step 4: View detailed logs

The debug server prints everything:
- Request received (bytes, partial content)
- Temp file location
- Command being run
- Exit code
- stdout/stderr
- Response sent

## Manual Testing with curl

### Test valid script:
```bash
curl -X POST \
  -H "Content-Type: text/plain" \
  -d 'puts "hello"' \
  http://localhost:8765/check
```

Expected:
```json
{"success":true,"stdout":"hello\n","stderr":"","exitCode":0}
```

### Test invalid command:
```bash
curl -X POST \
  -H "Content-Type: text/plain" \
  -d 'badcommand' \
  http://localhost:8765/check
```

Expected:
```json
{"success":false,"stdout":"","stderr":"invalid command name \"badcommand\"...","exitCode":1}
```

### Test multiline with error on line 2:
```bash
curl -X POST \
  -H "Content-Type: text/plain" \
  -d $'puts "line 1"\nbadcmd\nputs "line 3"' \
  http://localhost:8765/check
```

Expected: stderr should include `line 2`

## Debugging the Extension

### 1. Configure VS Code settings
Create/edit `.vscode/settings.json`:
```json
{
  "tcl.runtime.useRemote": true,
  "tcl.runtime.remoteUrl": "http://localhost:8765/check",
  "tcl.runtime.enableSyntaxCheck": true
}
```

### 2. Start the server in Terminal 1:
```bash
cd /home/markkmetz/Documents/tcl/bin
python3 tcl-syntax-server-debug.py 8765
```

### 3. In VS Code:
- Press F5 to launch Extension Development Host
- Or reload window if already running
- Open Debug Console (Ctrl+Shift+Y) to see logs

### 4. Create a test TCL file in workspace:
```tcl
puts "line 1"
badcommand
puts "line 3"
```

### 5. Save the file and watch:
- Server terminal: Should show request received, stderr captured, response sent
- VS Code Debug Console: Should show `[tclsh-remote] Created diagnostic on line 2: ...`
- Editor: Should highlight line 2 with red squiggle

## Troubleshooting

### Server not responding?
```bash
# Check if port is in use
lsof -i :8765

# If port is taken, use different port:
python3 tcl-syntax-server-debug.py 9000

# Update settings.json:
"tcl.runtime.remoteUrl": "http://localhost:9000/check"
```

### tclsh not found?
```bash
# Find tclsh location
which tclsh
# Or list available versions
ls /usr/bin/tclsh*

# Use it explicitly:
TCLSH_PATH=/usr/bin/tclsh8.6 python3 tcl-syntax-server-debug.py 8765
```

### Bad response from server?
```bash
# Test with curl to see actual JSON
curl -X POST -d 'puts test' http://localhost:8765/check | jq
```

### Extension not connecting?
1. Make sure server is running on correct port
2. Check `.vscode/settings.json` has correct URL
3. Check Debug Console for `[tclsh-remote]` messages
4. Check server terminal for request logs

## Environment Variables

### TCLLIBPATH
If you have custom TCL libraries:
```bash
export TCLLIBPATH="/path/to/libs"
python3 tcl-syntax-server-debug.py 8765
```

### TCLSH_PATH
If tclsh is in non-standard location:
```bash
export TCLSH_PATH="/opt/tcl/bin/tclsh8.6"
python3 tcl-syntax-server-debug.py 8765
```

## Logs Worth Checking

**Server terminal (all requests):**
```
2026-02-08 ... - Received request with 42 bytes
2026-02-08 ... - Script content: puts "test"...
2026-02-08 ... - Temp script file: /tmp/tmpXXXXXX.tcl
2026-02-08 ... - Running: tclsh /tmp/tmpXXXXXX.tcl
2026-02-08 ... - Exit code: 0
2026-02-08 ... - Sending response: {"success":true,...
```

**VS Code Debug Console (extension side):**
```
[tclsh-remote] Created diagnostic on line 2: invalid command name "badcommand"
```

**Missing these?** 
- If no server logs: Extension can't reach server
- If no extension logs: Diagnostic creation failed (check parse)
