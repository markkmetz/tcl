# Brackets inside quoted strings should be treated as literal text.
proc quotedBracketValid {name} {
  set literalOpen "this is literal [ text"
  set literalClose "this is literal ] text"
  set mixed "[] [{}] ] [ still literal in quotes"
  set escaped "escaped literal \\[ and \\] also stays literal"
  set computed [string length $name]
  return $computed
}
