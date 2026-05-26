# Companion fixture for indexer.test.ts
namespace eval IndexerDemo {
  variable count 0

  proc bump {name} {
    variable count
    incr count
    return $name
  }
}

IndexerDemo::bump demo