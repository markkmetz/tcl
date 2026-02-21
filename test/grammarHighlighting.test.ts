import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

describe('TCL Grammar Highlighting', () => {
  const grammarPath = path.join(__dirname, '..', 'syntaxes', 'tcl.tmLanguage.json');
  const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
  const paramPattern = grammar.repository.definitions.patterns.find(
    (pattern: { name?: string }) => pattern.name === 'meta.definition.parameters.tcl'
  )?.match;
  const doubleQuotePattern = grammar.repository.strings.patterns.find(
    (pattern: { name?: string }) => pattern.name === 'string.quoted.double.tcl'
  );

  it('should match method parameters with escaped brackets in defaults', () => {
    const line = 'method processData {{format "json"} {pattern "\\[\\]"} {schema "{}"}} {';
    const regex = new RegExp(paramPattern, 'g');
    const matches = [...line.matchAll(regex)].map(match => match[0]);

    expect(matches).to.deep.equal([
      '{format "json"}',
      '{pattern "\\[\\]"}',
      '{schema "{}"}'
    ]);
  });

  it('should keep braces inside quoted defaults within the same parameter', () => {
    const line = 'method buildQuery {{where "{id > 0}"} {order "name ASC"} {limit 10}} {';
    const regex = new RegExp(paramPattern, 'g');
    const matches = [...line.matchAll(regex)].map(match => match[0]);

    expect(matches[0]).to.equal('{where "{id > 0}"}');
    expect(matches).to.have.lengthOf(3);
  });

  it('should not treat escaped quote (\\") as start of a string', () => {
    const line = 'set value \\"$value\\"';
    const beginRegex = new RegExp(doubleQuotePattern.begin, 'g');
    const beginMatches = [...line.matchAll(beginRegex)];

    expect(beginMatches).to.have.lengthOf(0);
  });

  it('should still detect real unescaped double-quoted strings', () => {
    const line = 'set value "$value"';
    const beginRegex = new RegExp(doubleQuotePattern.begin, 'g');
    const endRegex = new RegExp(doubleQuotePattern.end, 'g');
    const beginMatches = [...line.matchAll(beginRegex)];
    const endMatches = [...line.matchAll(endRegex)];

    expect(beginMatches.length).to.equal(2);
    expect(endMatches.length).to.equal(2);
  });
});