# Test file for dict get completion
# 
# FEATURE 1: Dictionary variable suggestions
# Type: dict get $<press space or Ctrl+Space>
# You should see suggestions: config, userInfo (with their keys shown)
#
# FEATURE 2: Dictionary key suggestions  
# Type: dict get $config <press space>
# You should see suggestions: host, port, debug, paths

set config [dict create \
  host "localhost" \
  port 8080 \
  debug true \
  paths [dict create \
    data "/var/data" \
    logs "/var/logs" \
  ] \
]

# Test basic dict get completion
set hostname [dict get $config host]

# Test nested dict get completion
# Try: dict get $config paths <press space>
# You should see: data, logs
set dataPath [dict get $config paths data]

# Another example
set userInfo [dict create \
  id 123 \
  name "John Doe" \
  email "john@example.com" \
  address [dict create \
    street "123 Main St" \
    city "Boston" \
    zip "02101" \
  ] \
]

# Try typing: dict get $
# Should auto-suggest: $config, $userInfo

# Try: dict get $userInfo <press space>
# Should show: id, name, email, address

# Try: dict get $userInfo address <press space>
# Should show nested keys: street, city, zip
