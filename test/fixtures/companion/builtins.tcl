# Companion fixture for builtins.test.ts
set title "Builtin coverage"
set items {alpha beta gamma}
foreach item $items {
  puts [string toupper $item]
}

if {[string length $title] > 0} {
  puts $title
}

dict set cfg name example
dict get $cfg name