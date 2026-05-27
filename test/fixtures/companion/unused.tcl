# Companion fixture for unused.test.ts
set unusedVar 1

set values {}
lappend values item

set total 0
puts total

set config [dict create]
dict set config host localhost

set combined 1; puts combined

set commented 1
# commented appears here but should not count

proc unusedProc {x} {
  return $x
}

proc usedProc {x} {
  return [expr {$x + 1}]
}

usedProc 2