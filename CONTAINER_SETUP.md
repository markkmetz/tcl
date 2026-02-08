# TCL Container Syntax Checking Setup

This guide explains how to set up syntax checking when developing inside a Linux container.

## Quick Start

### 1. Start the syntax check server in your container

```bash
# In your container
cd /path/to/extension/bin
python3 tcl-syntax-server.py 8765
```

### 2. Configure VS Code settings

Add to your `.vscode/settings.json` or user settings:

```json
{
  "tcl.runtime.useRemote": true,
  "tcl.runtime.remoteUrl": "http://localhost:8765/check"
}
```

### 3. Start developing!

The extension will now send syntax checks to your container instead of using a local tclsh.

## Advanced Setup

### With Custom TCL Libraries

If your container has custom TCL libraries or dependencies:

```bash
# Set TCLLIBPATH before starting the server
export TCLLIBPATH="/path/to/your/tcl/libs /another/path"
export TCLSH_PATH="/usr/bin/tclsh8.6"  # Optional: specify exact tclsh path
python3 tcl-syntax-server.py 8765
```

### Run as a Background Service

#### Using systemd (in container)

Create `/etc/systemd/system/tcl-syntax.service`:

```ini
[Unit]
Description=TCL Syntax Check Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/app
Environment="TCLLIBPATH=/path/to/libs"
ExecStart=/usr/bin/python3 /path/to/tcl-syntax-server.py 8765
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable tcl-syntax
sudo systemctl start tcl-syntax
```

#### Using Docker Compose

Add to your `docker-compose.yml`:

```yaml
services:
  dev-container:
    image: your-image
    ports:
      - "8765:8765"
    volumes:
      - .:/workspace
    command: >
      bash -c "python3 /workspace/bin/tcl-syntax-server.py 8765 &
               && your-main-command"
```

### Port Forwarding for Remote Containers

If using VS Code Remote - Containers:

1. VS Code automatically forwards ports
2. The extension connects to `localhost:8765`
3. VS Code tunnels it to the container

**Manual port forwarding:**

```bash
# SSH tunnel
ssh -L 8765:localhost:8765 user@container-host

# Or in .ssh/config
Host my-container
    LocalForward 8765 localhost:8765
```

## Settings Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `tcl.runtime.useRemote` | boolean | `false` | Use remote syntax check service |
| `tcl.runtime.remoteUrl` | string | `http://localhost:8765/check` | URL of syntax check service |
| `tcl.runtime.enableSyntaxCheck` | boolean | `true` | Enable syntax checking |

## Troubleshooting

### Check if server is running

```bash
curl -X POST -d 'puts "Hello"' http://localhost:8765/check
```

Expected response:
```json
{"success":true,"stdout":"Hello\n","stderr":"","exitCode":0}
```

### Check VS Code Debug Console

The extension logs all syntax check activity. Open Debug Console in VS Code to see:

```
[tclsh-remote] Created diagnostic on line 2: invalid command name "badcommand"
```

### Common Issues

**Port already in use:**
```bash
# Find process using port 8765
lsof -i :8765
# Kill it or use a different port
python3 tcl-syntax-server.py 9000
```

**Connection refused:**
- Check if server is running
- Verify port forwarding (for remote containers)
- Check firewall rules

**Timeout:**
- Server may be overloaded or script has infinite loop
- Check server logs
- Increase timeout in server code if needed

## Security Notes

- The server accepts **any** TCL code for execution
- Only run this in isolated development containers
- Do NOT expose to public networks
- Use firewall rules to restrict access
- Consider adding authentication for production use

## Alternative: Docker Exec Approach

If you can't run a persistent service, you can configure the extension to use `docker exec`:

```json
{
  "tcl.runtime.tclshPath": "docker",
  "tcl.runtime.tclshArgs": ["exec", "my-container", "tclsh"]
}
```

Note: This requires modifying the extension code to support custom arguments.
