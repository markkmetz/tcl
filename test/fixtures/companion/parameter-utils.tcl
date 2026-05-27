# Companion fixture for parameterUtils.test.ts
proc configureThing {name {mode default} {verbose 0}} {
  return [list $name $mode $verbose]
}

configureThing alpha
configureThing beta custom 1