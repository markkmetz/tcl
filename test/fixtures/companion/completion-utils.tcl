# Companion fixture for completionUtils.test.ts
try {
  puts "ok"
} on error {msg opts} {
  puts $msg
} on ok {result} {
  puts $result
}