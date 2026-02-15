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

# Nested database configuration
set database [dict create \
  connection [dict create \
    host db.example.com \
    port 5432 \
    timeout 30 \
  ] \
  credentials [dict create \
    user admin \
    password secret \
  ] \
  options [dict create \
    ssl true \
    poolsize 10 \
  ] \
]

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

# Inline dictionary definitions
set userInfo [dict create id 1 name "John Doe" email "john@example.com" verified true]
set apiConfig [dict create endpoint "https://api.example.com" timeout 30 retries 3 headers [dict create Content-Type application/json Authorization Bearer]]

# Methods with default params containing brackets
method processData {{format "json"} {pattern "\[\]"} {schema "{}"}} {
  # process with bracket patterns in defaults
  return "processed"
}

# Methods with complex default values
method buildQuery {{where "{id > 0}"} {order "name ASC"} {limit 10}} {
  return "SELECT * FROM table WHERE $where ORDER BY $order LIMIT $limit"
}

# Dictionary with bracket/brace values
set patterns [dict create \
  brackets "\[\]" \
  braces "{}" \
  mixed "{\[\]}" \
  escaped "\\\[\\\]" \
]

# Inline nested dictionaries
set appConfig [dict create \
  server [dict create host localhost port 8080 ssl true] \
  database [dict create host dbserver port 5432 name mydb] \
  features [dict create auth true logging true cache true] \
]

# More inline dicts with mixed content
set metrics [dict create cpu 45.5 memory 1024 disk 2048 network [dict create in 100 out 50]]
set responses [dict create success [dict create code 200 msg "OK"] error [dict create code 500 msg "Server Error"]]

# Dict creation with variable references (should not include $vars as keys)
set prefix "app_"
set dynConfig [dict create key1 value1 key2 value2]

# Multiple dict set operations in sequence
set state [dict create]
dict set state initialized false
dict set state created [clock seconds]
dict set state version 1.0
dict set state status "ready"
dict set state error_count 0

# Proc using dict in namespace with defaults
namespace eval ::Analytics {
  proc trackEvent {{eventName "default"} {data [dict create timestamp 0 source "unknown"]}} {
    return $data
  }

  proc reportMetrics {{period "daily"} {format [dict create type json verbose false]}} {
    return $format
  }
}

# Dictionary access with nested keys
set result [dict get $appConfig server host]
set errorMsg [dict get $responses error msg]
set inMetrics [dict get $metrics network in]

# Complex dict operations
proc deepUpdate {dict path value} {
  dict set dict {*}$path $value
  return $dict
}

# Class-like structure with dicts
namespace eval ::DataModel {
  variable schema [dict create \
    User [dict create id int name string email string] \
    Product [dict create id int title string price float] \
  ]
}

# ===== PROC EXAMPLES WITH DICTIONARIES =====

# Simple utility proc with dict creation
proc createConfig {host port debug} {
  set config [dict create host $host port $port debug $debug]
  dict set config created [clock seconds]
  return $config
}

# Proc with default parameter values
proc buildRequest {{method "GET"} {headers [dict create]}} {
  dict set headers User-Agent "TCL/8.6"
  dict set headers Content-Type application/json
  return [dict create method $method headers $headers body ""]
}

# Proc that processes dictionary data
proc processUserData {userDict} {
  set processed [dict create]
  dict set processed id [dict get $userDict id]
  dict set processed name [string toupper [dict get $userDict name]]
  dict set processed email [dict get $userDict email]
  dict set processed timestamp [clock seconds]
  return $processed
}

# Proc with variadic arguments for dict merging
proc mergeMultipleDicts {baseDict args} {
  foreach dictToMerge $args {
    foreach {key value} $dictToMerge {
      dict set baseDict $key $value
    }
  }
  return $baseDict
}

# Proc that validates dictionary structure
proc validateConfig {config requiredKeys} {
  foreach key $requiredKeys {
    if {![dict exists $config $key]} {
      error "Missing required key: $key"
    }
  }
  return 1
}

# Proc with nested dict operations
proc extractNestedValue {dict pathList} {
  set current $dict
  foreach key $pathList {
    set current [dict get $current $key]
  }
  return $current
}

# Proc for deep copying dictionaries
proc deepCopyDict {sourceDict} {
  set copy [dict create]
  dict for {key value} $sourceDict {
    if {[catch {dict get $value ""}]} {
      # Simple value, just copy
      dict set copy $key $value
    } else {
      # Nested dict, recursively copy
      dict set copy $key [deepCopyDict $value]
    }
  }
  return $copy
}

# ===== METHOD EXAMPLES WITH DICTIONARIES =====

namespace eval ::ConfigManager {
  # Method with dict defaults
  method initialize {{defaultConfig [dict create timeout 30 retries 3 verbose false]}} {
    set config $defaultConfig
    dict set config initialized true
    return $config
  }

  # Method with multiple dict parameters
  method merge {baseConfig updateConfig} {
    dict for {key value} $updateConfig {
      dict set baseConfig $key $value
    }
    return $baseConfig
  }

  # Method that returns dict with status
  method getStatus {{includeTimestamp true}} {
    set status [dict create ok true code 200]
    if {$includeTimestamp} {
      dict set status timestamp [clock seconds]
      dict set status uptime [expr {[clock seconds] - 1000000}]
    }
    return $status
  }

  # Method with dict inspection
  method describe {dict} {
    set description [dict create]
    set keyCount [llength [dict keys $dict]]
    dict set description keyCount $keyCount
    dict set description keys [dict keys $dict]
    dict set description size [string length [dict values $dict]]
    return $description
  }
}

# ===== NAMESPACE WITH MULTIPLE METHODS USING DICTS =====

namespace eval ::Database {
  variable connection [dict create host localhost port 5432]
  
  method connect {{params [dict create timeout 10 pool true]}} {
    dict for {key value} $params {
      dict set connection $key $value
    }
    set connection [dict create connected true {*}$connection]
    return $connection
  }

  method query {sql {options [dict create format list caching false]}} {
    set results [dict create]
    dict set results query $sql
    dict set results options $options
    dict set results rows [list]
    dict set results rowCount 0
    return $results
  }

  method transaction {{operations [dict create]}} {
    set result [dict create status begun timestamp [clock seconds]]
    dict set result operationCount [llength [dict keys $operations]]
    return $result
  }
}

# ===== COMPLEX PROC WITH BRACKET DEFAULTS =====

proc formatQuery {{pattern "^[a-z]+$"} {regex ".*\[\].*"} {escape "\\\["}} {
  set query [dict create pattern $pattern regex $regex escape $escape]
  return $query
}

# Proc that transforms dict with lambda-like operations
proc transformDict {dict transformer} {
  set result [dict create]
  dict for {key value} $dict {
    # Apply transformation (simplified example)
    set newValue [string toupper $value]
    dict set result $key $newValue
  }
  return $result
}

# Proc accepting dict and returning modified version
proc applyDefaults {userDict {defaults [dict create role user status active verified false]}} {
  foreach {key value} $defaults {
    if {![dict exists $userDict $key]} {
      dict set userDict $key $value
    }
  }
  return $userDict
}
