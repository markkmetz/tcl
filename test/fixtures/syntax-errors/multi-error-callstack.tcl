# Fixture: primary parse/syntax failure followed by unreachable code
proc brokenProc {x} {
  if {$x > 0} {
    puts "positive"
  # missing close brace for proc

set undefined_use $doesNotExist
