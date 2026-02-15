# This file has valid TCL syntax
proc validProc {arg1 arg2} {
  puts "Arg1: $arg1"
  puts "Arg2: $arg2"
  
  set result [expr {$arg1 + $arg2}]
  return $result
}

namespace eval MyNamespace {
  proc myMethod {this value} {
    puts "Value: $value"
    return [expr {$value * 2}]
  }
}

set config [dict create]
dict set config host "localhost"
dict set config port 8080

puts "Configuration complete"
