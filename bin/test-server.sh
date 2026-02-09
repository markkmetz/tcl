#!/usr/bin/env bash
# Quick test script for tcl-syntax-server.py
# Run this in a terminal while the server is running in another terminal

echo "Testing TCL Syntax Server..."
echo ""

# Test 1: Valid TCL script
echo "Test 1: Valid script (should succeed)"
curl -X POST \
  -H "Content-Type: text/plain" \
  -d 'puts "Hello World"' \
  http://localhost:8765/check
echo -e "\n"

# Test 2: Invalid command (error case)
echo "Test 2: Invalid command (should show error)"
curl -X POST \
  -H "Content-Type: text/plain" \
  -d 'invalid_command foo' \
  http://localhost:8765/check
echo -e "\n"

# Test 3: Syntax error on specific line
echo "Test 3: Error on line 2"
curl -X POST \
  -H "Content-Type: text/plain" \
  -d 'puts "line 1"
bad_command
puts "line 3"' \
  http://localhost:8765/check
echo -e "\n"

# Test 4: Complex TCL with namespace
echo "Test 4: Namespace test"
curl -X POST \
  -H "Content-Type: text/plain" \
  -d 'namespace eval myns {
  proc myfunc {x} {
    return [expr {$x * 2}]
  }
}
puts [myns::myfunc 5]' \
  http://localhost:8765/check
echo -e "\n"

echo "Done!"
