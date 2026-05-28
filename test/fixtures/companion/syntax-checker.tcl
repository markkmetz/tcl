# Companion fixture for syntaxChecker.test.ts

proc balancedScript {value} {
  set message "value=$value"
  if {[string length $message] > 0} {
    return [list ok $message]
  }
  return [list empty]
}

set syntaxResult [balancedScript demo]
puts $syntaxResult
