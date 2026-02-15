import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

describe('TCL Grammar Highlighting', () => {
  const grammarPath = path.join(__dirname, '..', 'syntaxes', 'tcl.tmLanguage.json');
  const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
  const paramPattern = grammar.repository.definitions.patterns.find(
    (pattern: { name?: string }) => pattern.name === 'meta.definition.parameters.tcl'
  )?.match;

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
});