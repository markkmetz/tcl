# This file has missing close brace
proc testMissingBrace {arg1 arg2} {
  puts "Starting test"
  if {$arg1 > 0} {
    puts "Arg1 is positive"
  }
  # Missing closing brace below
