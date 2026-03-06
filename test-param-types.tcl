# Test file for parameter type hints

proc example1 {name {age 0} {salary 0.0}} {
    puts "Name: $name, Age: $age, Salary: $salary"
}

proc example2 {message {enabled true} {config {}}} {
    if {$enabled} {
        puts $message
    }
}

proc example3 {x {list_data [list a b c]} {dict_data [dict create key value]}} {
    puts "X: $x"
    puts "List: $list_data"
    puts "Dict: $dict_data"
}

proc example4 {input {default_str ""} {count 10}} {
    for {set i 0} {$i < $count} {incr i} {
        puts "$input $default_str"
    }
}

proc example5 {value {is_valid yes} {multiplier 1.5} {result [expr {2 + 2}]}} {
    if {$is_valid} {
        return [expr {$value * $multiplier + $result}]
    }
    return 0
}

# Hover over these proc calls to see parameter hints with types
example1 "John" 25 50000.00
example2 "Hello" true {}
example3 1 [list x y z] [dict create name "test"]
example4 "Test" "" 5
example5 10 yes 2.0 4
