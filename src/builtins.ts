export const BUILTINS: Record<string, { description: string; params: string[] }> = {
  
  set: { description: 'Set or read the value of a variable.', params: ['varName', 'value?'] },
  dict: { description: 'Create or manipulate dictionaries.', params: ['command', 'args...'] },
  return: { description: 'Return a value from a procedure.', params: ['value?'] },
  open: { description: 'Open a file or channel.', params: ['fileName', 'mode?'] },
  source: { description: 'Read and evaluate a Tcl script file.', params: ['filePath'] },
  expr: { description: 'Evaluate an expression and return its result.', params: ['expression'] },
  string: { description: 'String operations (length, range, etc.).', params: ['subcommand', 'args...'] },
  list: { description: 'Create or operate on lists.', params: ['elements...'] },
  lappend: { description: 'Append elements to a list variable.', params: ['varName', 'elements...'] },
  lindex: { description: 'Return an element from a list by index.', params: ['list', 'index'] },
  llength: { description: 'Return the length of a list.', params: ['list'] },
  puts: { description: 'Print text to a channel (stdout by default).', params: ['message'] },
  socket: { description: 'Create a network socket.', params: ['host', 'port'] },
  package: { description: 'Manage packages.', params: ['require|provide', 'args...'] },
  
  exit: { description: 'Exit the interpreter.', params: ['code?'] },
  info: { description: 'Get information about the interpreter.', params: ['subcommand', 'args...'] },
  join: { description: 'Join list elements into a string.', params: ['list', 'sep?'] },
  split: { description: 'Split a string into a list.', params: ['string', 'sep?'] },
  format: { description: 'Format a string using a printf-like format.', params: ['format', 'args...'] },
  apply: { description: 'Create and call an anonymous lambda.', params: ['lambda', 'args...'] },
};

export const SNIPPETS: Record<string, { description: string; params: string[]; snippet: string }> = {
  proc: {
    description: 'Define a new procedure.',
    params: ['name', 'argList', 'body'],
    snippet: 'proc ${1:name} {${2:args}} {\n\t${0}\n}'
  },
  namespace: {
    description: 'Create or manipulate a namespace.',
    params: ['name'],
    snippet: 'namespace eval ${1:name} {\n\t${0}\n}'
  }
};

export const BUILTIN_NAMES = Object.keys(BUILTINS);
