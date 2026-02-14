# Sample TCL with dictionaries for testing
namespace eval ::DictTest {
  proc createUser {name age} {
    set user [dict create name $name age $age email "user@example.com"]
    return $user
  }

  proc getUserName {user} {
    return [dict get $user name]
  }

  proc updateUser {user key value} {
    dict set user $key $value
    return $user
  }
}

# Global dictionary
set config [dict create \
  host "localhost" \
  randomtext "{[[[" \
  motext "{}'/[]" \
  port 8080 \
  debug true \
  paths [dict create \
    data "/var/data" \
    logs "/var/logs" \
  ] \
]

# Dictionary access patterns
set hostname [dict get $config host]
set dataPath [dict get $config paths data]

# Nested dict updates
dict set config debug false
dict set config paths logs "/var/log/app"

# More dictionary examples
set settings [dict create theme dark language en timezone UTC]
set cache [dict create expires 3600 ttl 1800]

# Update cache dict
dict set cache maxsize 1000
dict set cache compression gzip

# Proc with dict operations
proc mergeConfigs {baseConfig overrides} {
  foreach {key value} $overrides {
    dict set baseConfig $key $value
  }
  return $baseConfig
}

# Dict operations in loops
set allDicts [dict create]
foreach item {apple banana cherry} {
  dict set allDicts $item "fruit"
}

# Namespace-scoped dict operations
namespace eval ::Utils {
  set defaults [dict create retries 3 timeout 5000 verbose false]
  dict set defaults encoding utf-8
}

dict set config paths logs "/var/log/app"
