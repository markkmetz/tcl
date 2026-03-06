proc foo {a} { return $a }

namespace eval ::ns1 {
  proc foo {x} { return $x }
}

# calling foo here at global level
