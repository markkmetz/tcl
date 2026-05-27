# Companion fixture for dictCommands.test.ts
set cfg [dict create host localhost port 8080]
dict set cfg timeout 30
dict get $cfg host
dict exists $cfg port
dict keys $cfg