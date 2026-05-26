# Companion fixture for completionProvider.test.ts
namespace eval CompletionDemo {
  proc build {name value} {
    return "$name:$value"
  }

  set localValue 1
  set helperName build
}

CompletionDemo::build sample 42