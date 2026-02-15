# This file has missing close bracket
proc testMissingBracket {value} {
  set result [expr {$value * 2}
  return $result
# Missing bracket causes error here
