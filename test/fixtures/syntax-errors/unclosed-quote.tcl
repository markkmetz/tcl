# This file has unclosed quote that extends past the proc
proc testQuoteError {name} {
  puts "Hello $name this quote never closes and continues
  puts "This line is inside the quote
}
set x "This is also never closed
