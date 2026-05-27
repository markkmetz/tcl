# Fixture: wrong argument count at a known line
proc addTwo {a b} {
  return [expr {$a + $b}]
}

set value [addTwo 10]
puts $value
