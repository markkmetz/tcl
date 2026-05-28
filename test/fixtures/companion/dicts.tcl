# Companion fixture for dicts.test.ts

namespace eval DictParity {
  proc makeConfig {} {
    set cfg [dict create host localhost port 8080 enabled true]
    dict set cfg retries 3
    return $cfg
  }

  proc hostFromConfig {cfg} {
    return [dict get $cfg host]
  }
}

set dictParityConfig [DictParity::makeConfig]
puts [DictParity::hostFromConfig $dictParityConfig]
