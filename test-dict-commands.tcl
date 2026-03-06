# Test file for dict command completion

# Create a sample dictionary
set mydict [dict create \
    name "John Doe" \
    age 30 \
    email "john@example.com" \
    address "123 Main St" \
    phone "555-1234" \
]

# Test dict set completion - should suggest: name, age, email, address, phone
dict set mydict 

# Test dict lappend completion - should suggest keys with value snippet
dict lappend mydict 

# Test dict incr completion - should suggest numeric keys with increment snippet
dict incr mydict 

# Test dict append completion - should suggest keys with value snippet
dict append mydict 

# Test dict get completion - should suggest keys
dict get mydict 

# Test dict exists completion - should suggest keys
dict exists mydict 

# Test dict unset completion - should suggest keys
dict unset mydict 

# Create another dictionary for testing
set userConfig [dict create \
    theme "dark" \
    fontSize 12 \
    lineNumbers true \
    autoSave true \
]

# Test with different dictionary
dict set userConfig 
dict get userConfig 
dict lappend userConfig 

# Test nested dictionary
set appSettings [dict create \
    user [dict create \
        name "Alice" \
        role "admin" \
    ] \
    database [dict create \
        host "localhost" \
        port 5432 \
    ] \
]

# Test completion on nested dict
dict get appSettings user 
dict get appSettings database 

# ===== MULTIPLE KEY-VALUE PAIR TESTS =====
# Test that completion re-prompts after each value for dict set
# After typing "John Doe" and pressing space, should prompt for next key
dict set mydict name "John Doe" 

# After entering multiple pairs, should still suggest keys
# BUT it should exclude "name" and "age" since they're already used
dict set mydict name "John" age 30 

# Same behavior with dict append - should re-prompt after each value
# Should exclude "phone" and "email" from suggestions
dict append mydict phone "+1-555-" email "john" 

# And dict lappend for appending to list values - should re-prompt
# Should exclude "tags" from second suggestion (since it's already used)
dict lappend mydict tags "work" tags "important" 

