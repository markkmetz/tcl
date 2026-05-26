# Companion fixture for namespaceResolution.test.ts
namespace eval NS1 {
  proc one {} {
    return 1
  }
}

namespace eval NS2 {
  proc two {} {
    return [NS1::one]
  }
}

NS1::one
NS2::two