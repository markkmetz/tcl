# Second sample TCL for namespace/import tests
namespace eval ::ns3 {
  proc foo {x {y 2}} {
    set s "}{[[[]]]"; # braces/brackets in string
    set calc [expr {([expr {$x}]) + ([expr {$y}])}]
    return [expr {$x * $y}]
  }
}

# Fully qualified proc in another namespace
proc ::ns4::bar {p q} {
  set s "{}}}}"; # braces in string
  set calc [expr {([expr {$p}]) + ([expr {$q}])}]
  return [list $p $q]
}

# Import external namespace (ns1 from other file)
namespace import ::ns1::*
