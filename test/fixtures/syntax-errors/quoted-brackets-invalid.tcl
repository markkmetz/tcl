# Real unmatched bracket outside quotes should still be reported.
set quoted_ok "this [ and ] are fine inside quotes"
set also_quoted_ok "literal open [ and close ] chars"
set broken [string length "abc"
