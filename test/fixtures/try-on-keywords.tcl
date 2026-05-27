# try-on-keywords.tcl
# Fixture for testing hover / Go-to-Definition suppression on try...on keyword tokens.
#
# EXPECTED EXTENSION BEHAVIOR — manual test guide:
#
#   Hover (F2 / mouse hover) and Go-to-Definition (F12) should be SUPPRESSED for
#   the handler-type keywords that immediately follow "on":
#
#     Line: "} on ok {result opts} {"      — hover/F12 on "ok"       → nothing
#     Line: "} on error {msg opts} {"      — hover/F12 on "error"     → nothing
#     Line: "} on return {result opts} {"  — hover/F12 on "return"    → nothing
#     Line: "} on break {} {"              — hover/F12 on "break"     → nothing
#     Line: "} on continue {} {"          — hover/F12 on "continue"  → nothing
#
#   Hover/F12 should still work when the SAME words are used as commands:
#
#     Line: "    return $result"           — hover on "return"  → builtin docs
#     Line: "    error $msg"              — hover on "error"   → proc/builtin

proc exampleProc {x} {
    set result [expr {$x * 2}]
    return $result
}

proc errorProc {msg} {
    error $msg
}

try {
    set outcome [exampleProc 5]
} on ok {result opts} {
    puts "ok: $result"
} on error {msg opts} {
    puts "error: $msg"
} on return {result opts} {
    puts "return: $result"
} on break {} {
    puts "break"
} on continue {} {
    puts "continue"
}
