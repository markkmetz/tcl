# Companion fixture for semanticProvider.test.ts
namespace eval SemanticDemo {
  proc call {arg} {
    return $arg
  }

  variable state active
}

SemanticDemo::call hello