# Dedicated fixture for quote/highlighting regression tests
namespace eval HighlightRegression {
  proc runCases {value} {
    set title "Normal title"
    set escaped_a \"$value\"
    set counter 1234

    set sql "select * from users where id = $value"
    set escaped_b \"literal text\"
    set retries 5

    if {$counter > 1000} {
      puts "large counter"
    }

    set path "/tmp/${value}"
    set escaped_c \"${value}_suffix\"
    set code 9001

    dict set cfg name "example"
    dict set cfg escaped \"dict-value\"
    dict set cfg ttl 60

    foreach item {a b c} {
      puts "$item"
    }

    set final_message "done"
    set escaped_d \"$final_message\"
    set result 42

    # set-var stress cases: brackets, escapes, and inline expressions
    set var01 "plain text"
    set var02 "with [string toupper $value] inline call"
    set var03 "math [expr {$counter + 1}] and text"
    set var04 "balanced () [] {} all together"
    set var05 "non-matching open bracket [ should stay text"
    set var06 "non-matching close bracket ] should stay text"
    set var07 "escaped quote \"inside\" normal string"
    set var08 "escaped brackets \\[not-a-command\\] literal"
    set var09 "path C:\\tmp\\$value\\file.txt"
    set var10 "nested call [string map {a A} [string trim $value]]"
    set var11 "brace chars in string {alpha beta}"
    set var12 "paren expr ([expr {$counter * 2}]) done"
    set var13 "dollar escapes \$HOME \${value}"
    set var14 {[raw braces] with $noSubst and [noSubstCall]}
    set var15 [format "id=%s count=%d" $value $counter]
    set var16 [string cat "prefix-" $value "-suffix"]
    set var17 "quoted command text: [dict get $cfg name]"
    set var18 "mismatched paren ( still text"
    set var19 "mismatched brace } still text"
    set var20 "combo \"q\" [expr {$code - 1}] \[literal\]"
    set var21 [subst {value=$value code=$code}]
    set var22 "function-ish text myFunc([expr {$result + 3}])"

    return $result
  }
}
