namespace eval ::ns1 {
  set myvar "ns1_value"
}

namespace eval ::ns2 {
  set myvar "ns2_value"
  puts $myvar
}
