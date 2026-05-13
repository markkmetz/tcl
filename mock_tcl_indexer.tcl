#!/usr/bin/env tclsh

namespace eval ::MockIndexer {
  variable functions [dict create]
  variable telemetries [dict create]
}

proc ::MockIndexer::trim_leading_colons {name} {
  regsub {^::+} $name {} trimmed
  return $trimmed
}

proc ::MockIndexer::count_braces_outside_strings {line} {
  set open 0
  set close 0
  set inString 0

  for {set i 0} {$i < [string length $line]} {incr i} {
    set ch [string index $line $i]
    set prev [expr {$i > 0 ? [string index $line [expr {$i - 1}]] : ""}]

    if {$ch eq "\"" && $prev ne "\\"} {
      set inString [expr {!$inString}]
      continue
    }

    if {$inString} {
      continue
    }

    if {$ch eq "{"} {
      incr open
    } elseif {$ch eq "}"} {
      incr close
    }
  }

  return [list $open $close]
}

proc ::MockIndexer::tokenize_top_level {text} {
  set tokens [list]
  set current ""
  set braceDepth 0
  set bracketDepth 0
  set inString 0

  for {set i 0} {$i < [string length $text]} {incr i} {
    set ch [string index $text $i]
    set prev [expr {$i > 0 ? [string index $text [expr {$i - 1}]] : ""}]

    if {$ch eq "\"" && $prev ne "\\"} {
      set inString [expr {!$inString}]
      append current $ch
      continue
    }

    if {!$inString} {
      if {$ch eq "{"} {
        incr braceDepth
      } elseif {$ch eq "}" && $braceDepth > 0} {
        incr braceDepth -1
      } elseif {$ch eq "["} {
        incr bracketDepth
      } elseif {$ch eq "]" && $bracketDepth > 0} {
        incr bracketDepth -1
      }

      if {[string is space $ch] && $braceDepth == 0 && $bracketDepth == 0} {
        if {$current ne ""} {
          lappend tokens $current
          set current ""
        }
        continue
      }
    }

    append current $ch
  }

  if {$current ne ""} {
    lappend tokens $current
  }

  return $tokens
}

proc ::MockIndexer::extract_dict_keys_from_create {dictCreateExpr} {
  set expression [string trim $dictCreateExpr]

  if {[regexp {^\[dict\s+create\s+(.*)\]$} $expression -> body]} {
    set expression $body
  }

  set words [::MockIndexer::tokenize_top_level $expression]
  set keys [list]

  for {set i 0} {$i < [llength $words]} {incr i 2} {
    set key [lindex $words $i]
    if {$key eq ""} {
      continue
    }
    if {[string index $key 0] eq "$"} {
      continue
    }
    if {[regexp {^[A-Za-z0-9_]+$} $key]} {
      lappend keys $key
    }
  }

  return [lsort -unique $keys]
}

proc ::MockIndexer::scan_file {filePath} {
  variable functions
  variable telemetries

  set f [open $filePath r]
  set content [read $f]
  close $f

  set lines [split $content "\n"]
  set namespaceStack [list]
  set namespaceDepths [list]
  set braceDepth 0

  for {set i 0} {$i < [llength $lines]} {incr i} {
    set line [lindex $lines $i]

    if {[regexp {^\s*namespace\s+eval\s+([A-Za-z0-9_:]+)\s*\{} $line -> nsRaw]} {
      set ns [::MockIndexer::trim_leading_colons $nsRaw]
      lappend namespaceStack $ns
      lappend namespaceDepths [expr {$braceDepth + 1}]
    }

    lassign [::MockIndexer::count_braces_outside_strings $line] openBraces closeBraces
    set braceDepth [expr {$braceDepth + $openBraces - $closeBraces}]

    while {[llength $namespaceDepths] > 0 && $braceDepth < [lindex $namespaceDepths end]} {
      set namespaceDepths [lrange $namespaceDepths 0 end-1]
      set namespaceStack [lrange $namespaceStack 0 end-1]
    }

    if {[regexp {^\s*(proc|method)\s+([A-Za-z0-9_:.]+)\s+\{([^}]*)\}} $line -> type nameRaw paramsRaw]} {
      set cleanName [::MockIndexer::trim_leading_colons $nameRaw]
      set simpleName $cleanName
      set defNamespace ""

      if {[string first "::" $cleanName] >= 0} {
        set parts [split $cleanName "::"]
        set simpleName [lindex $parts end]
        set defNamespace [join [lrange $parts 0 end-1] "::"]
      } elseif {[llength $namespaceStack] > 0} {
        set defNamespace [lindex $namespaceStack end]
      }

      if {$defNamespace ne ""} {
        set normalizedFqName "${defNamespace}::${simpleName}"
      } else {
        set normalizedFqName $simpleName
      }

      set params [split [string trim $paramsRaw] " "]
      set params [lsearch -all -inline -not -exact $params ""]

      dict set functions $normalizedFqName [dict create \
        type $type \
        params $params \
        namespace $defNamespace \
        file $filePath \
        line [expr {$i + 1}] \
      ]
    }

    if {[regexp {^\s*set\s+([A-Za-z0-9_:.]+)\s+(.*)$} $line -> varName rawValue]} {
      set value [string trim $rawValue]
      if {[regexp {^\[dict\s+create\s+.*\]$} $value]} {
        set keys [::MockIndexer::extract_dict_keys_from_create $value]
        if {[llength $keys] > 0} {
          dict set telemetries $varName $keys
        }
      }
    }

    if {[regexp {dict\s+set\s+([A-Za-z0-9_:.]+)\s+([A-Za-z0-9_]+)} $line -> dictVar dictKey]} {
      set existing [expr {[dict exists $telemetries $dictVar] ? [dict get $telemetries $dictVar] : [list]}]
      lappend existing $dictKey
      dict set telemetries $dictVar [lsort -unique $existing]
    }
  }
}

proc ::MockIndexer::sanitize_proc_suffix {value} {
  set clean [string map {":" "_" "." "_" "-" "_"} $value]
  if {[regexp {^[0-9]} $clean]} {
    set clean "_$clean"
  }
  return $clean
}

proc ::MockIndexer::emit_mock_script {} {
  variable functions
  variable telemetries

  puts "# Generated mock Tcl API"
  puts "# Timestamp: [clock format [clock seconds] -format {%Y-%m-%dT%H:%M:%SZ} -gmt 1]"
  puts ""
  puts "namespace eval ::mock_index {}"
  puts "namespace eval ::mock_telemetry {}"
  puts ""

  set namespaces [dict create]
  foreach fqName [lsort [dict keys $functions]] {
    set info [dict get $functions $fqName]
    set ns [dict get $info namespace]
    if {$ns ne ""} {
      dict set namespaces $ns 1
    }
  }

  foreach ns [lsort [dict keys $namespaces]] {
    puts "namespace eval ::$ns {}"
  }

  if {[dict size $namespaces] > 0} {
    puts ""
  }

  puts "proc ::mock_index::list_functions {} {"
  puts "    return [list [lsort [dict keys $functions]]]"
  puts "}"
  puts ""

  foreach fqName [lsort [dict keys $functions]] {
    set info [dict get $functions $fqName]
    set type [dict get $info type]
    set params [dict get $info params]
    puts "proc ::$fqName {args} {"
    puts "    return [dict create mock true type {$type} fqName {$fqName} params [list $params]]"
    puts "}"
    puts ""
  }

  puts "proc ::mock_telemetry::list_telemetries {} {"
  puts "    return [list [lsort [dict keys $telemetries]]]"
  puts "}"
  puts ""

  foreach telemetry [lsort [dict keys $telemetries]] {
    set keys [dict get $telemetries $telemetry]
    set suffix [::MockIndexer::sanitize_proc_suffix $telemetry]
    puts "proc ::mock_telemetry::${suffix}_keys {} {"
    puts "    return [list $keys]"
    puts "}"
    puts ""
  }
}

proc ::MockIndexer::main {argv} {
  if {[llength $argv] == 0} {
    puts stderr "Usage: tclsh mock_tcl_indexer.tcl <file1.tcl> ?file2.tcl ...?"
    exit 1
  }

  foreach path $argv {
    if {![file exists $path]} {
      puts stderr "Skipping missing file: $path"
      continue
    }
    ::MockIndexer::scan_file $path
  }

  ::MockIndexer::emit_mock_script
}

::MockIndexer::main $argv
