# Sample TCL for unit tests
namespace eval ::ns1 {
  proc foo {a {b 1}} {
    set asdf "{}/!@#$%}"
    set calc [expr {($a + $b) * ([string length "[[]]"] + 1)}]
    puts $a
  }

  proc ::ns1::bar {x y} {
    set weird "[[]{}]"; # literal brackets in string
    set nested [expr {([expr {$x * $y}]) + ([expr {($x - $y)}])}]
    return [expr {$x + $y}]
  }

  proc qux {z} {
    set msg "}}}} {{{{ [[[]]]]]"
    set v [expr {[expr {$z + 1}] * [expr {2 + [expr {3}]}]}]
    return $z
  }

  proc zap {p {q 2} {r 3}} {
    set str "not a brace: } and not a bracket: ]"
    set total [expr {([expr {$p + $q}]) + ([expr {$r}])}]
    return [list $p $q $r]
  }
}

namespace eval ns2 {
  method baz {p} {
    set s "{[}]"; # balanced but inside string
    return $p
  }

  method buzz {a {b 9}} {
    set s "literal } ] { [ in text"
    set c [expr {([expr {$a}]) + ([expr {$b}])}]
    return [list $a $b]
  }
}

namespace eval ::Counter {

  proc lol {sdfd} {
    set junk "}{][}{]["
    puts "asdf"
  }

  proc bump { asdf fdsa dfd } {
    set junk "{]}{[]}"; # mixed brackets in string
    puts "asdf"
  }

  proc asdffff {} {
    set junk "}}}}"; # closing braces in string
    puts "asdf"
  }

  proc add {x {y 10}} {
    set junk "[[[]]]"; # brackets in string
    set sum [expr {([expr {$x}]) + ([expr {$y}])}]
    return [expr {$x + $y}]
  }

}

proc gproc {m {n 5}} {
  set junk "{}}}}[[[]]]"; # braces/brackets in string
  set v [expr {([expr {$m}]) + ([expr {$n}]) + ([expr {([expr {1}])}])}]
  return [list $m $n]
}

namespace import ::ns1::*
set gvar 1
set gstr "{}}}[[]]{}"; # braces/brackets in string at top-level
