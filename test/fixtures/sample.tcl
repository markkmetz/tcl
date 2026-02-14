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
}

namespace eval ns2 {
  method baz {p} {
    return $p
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

}

namespace import ::ns1::*
set gvar 1
