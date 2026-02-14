# Second sample TCL for namespace/import tests
namespace eval ::ns3 {
  proc foo {x {y 2}} {
    return [expr {$x * $y}]
  }
}

# Fully qualified proc in another namespace
proc ::ns4::bar {p q} {
  return [list $p $q]
}

# Import external namespace (ns1 from other file)
namespace import ::ns1::*
