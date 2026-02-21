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
  const singleQuotePattern = grammar.repository.strings.patterns.find(
    (pattern: { name?: string }) => pattern.name === 'string.quoted.single.tcl'
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

  it('should not define single-quoted string scope for Tcl', () => {
    expect(singleQuotePattern).to.equal(undefined);
  });

  it('should not leak string highlighting to the next line after escaped quotes', () => {
    const line1 = 'set value \\"$value\\"';
    const line2 = 'set value 1234';
    const beginRegex = new RegExp(doubleQuotePattern.begin, 'g');
    const endRegex = new RegExp(doubleQuotePattern.end, 'g');

    const line1Begins = [...line1.matchAll(beginRegex)];
    const line1Ends = [...line1.matchAll(endRegex)];
    const line2Begins = [...line2.matchAll(beginRegex)];
    const line2Ends = [...line2.matchAll(endRegex)];

    expect(line1Begins).to.have.lengthOf(0);
    expect(line1Ends).to.have.lengthOf(0);
    expect(line2Begins).to.have.lengthOf(0);
    expect(line2Ends).to.have.lengthOf(0);
  });

  it('should keep escaped-quote lines unquoted in dedicated sample fixture', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'highlighting-escaped-quotes.tcl');
    const lines = fs.readFileSync(fixturePath, 'utf8').split(/\r?\n/);
    const beginRegex = new RegExp(doubleQuotePattern.begin, 'g');
    const endRegex = new RegExp(doubleQuotePattern.end, 'g');

    expect(lines.length).to.be.within(20, 90);

    const escapedLines = lines.filter(line => line.includes('set escaped_'));
    expect(escapedLines.length).to.equal(4);

    for (const line of escapedLines) {
      expect([...line.matchAll(beginRegex)]).to.have.lengthOf(0);
      expect([...line.matchAll(endRegex)]).to.have.lengthOf(0);
    }

    const normalQuotedLines = lines.filter(line =>
      line.includes('set title "') ||
      line.includes('set sql "') ||
      line.includes('set path "') ||
      line.includes('set final_message "')
    );

    for (const line of normalQuotedLines) {
      expect([...line.matchAll(beginRegex)]).to.have.lengthOf(2);
      expect([...line.matchAll(endRegex)]).to.have.lengthOf(2);
    }

    const numericLines = lines.filter(line =>
      line.includes('set counter 1234') ||
      line.includes('set retries 5') ||
      line.includes('set code 9001') ||
      line.includes('set result 42')
    );

    for (const line of numericLines) {
      expect([...line.matchAll(beginRegex)]).to.have.lengthOf(0);
      expect([...line.matchAll(endRegex)]).to.have.lengthOf(0);
    }
  });
});