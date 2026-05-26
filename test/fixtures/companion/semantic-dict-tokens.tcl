# Companion fixture for semanticDictTokens.test.ts
set cfg [dict create name demo]
dict set cfg enabled true
dict get $cfg name
dict exists $cfg enabled