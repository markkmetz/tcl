# Companion fixture for unused.test.ts
set unusedVar 1

proc unusedProc {x} {
  return $x
}

proc usedProc {x} {
  return [expr {$x + 1}]
}

usedProc 2