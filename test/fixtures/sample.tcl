# Sample TCL for unit tests
namespace eval ::ns1 {
  proc foo {a {b 1}} {
    puts $a
  }

  proc ::ns1::bar {x y} {
    return [expr {$x + $y}]
  }

  proc qux {z} {
    return $z
  }

  proc zap {p {q 2} {r 3}} {
    return [list $p $q $r]
  }
}

namespace eval ns2 {
  method baz {p} {
    return $p
  }

  method buzz {a {b 9}} {
    return [list $a $b]
  }
}

namespace eval ::Counter {

  proc lol {sdfd} {
    puts "asdf"
  }

  proc bump { asdf fdsa dfd } {
    puts "asdf"
  }

  proc asdffff {} {
    puts "asdf"
  }

  proc add {x {y 10}} {
    return [expr {$x + $y}]
  }

}

proc gproc {m {n 5}} {
  return [list $m $n]
}

namespace import ::ns1::*
set gvar 1
