# Companion fixture for referenceUtils.test.ts
proc foo {} {
  return 1
}

proc bar {} {
  return [foo]
}

foo
bar
set value [foo]