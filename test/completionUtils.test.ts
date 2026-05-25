import { expect } from 'chai';
import { buildProcSnippet, normalizeProcParams, isTclKeywordPosition } from '../src/completionUtils';
import { BUILTINS } from '../src/builtins';

describe('Completion snippet utils', () => {
  it('builds a simple snippet with no params', () => {
    expect(buildProcSnippet('foo')).to.equal('foo$0');
  });

  it('builds a snippet with params', () => {
    expect(buildProcSnippet('ns1::bar', ['x', 'y'])).to.equal('ns1::bar ${1:x} ${2:y}$0');
  });

  it('normalizes default-value params', () => {
    expect(normalizeProcParams(['a', '{b', '1}'])).to.deep.equal(['a', 'b']);
  });

  it('builds a snippet with default param values', () => {
    expect(buildProcSnippet('foo', ['{x', '1}', 'y'])).to.equal('foo ${1:x} ${2:y}$0');
  });

  it('builds a snippet for namespace short name with params', () => {
    expect(buildProcSnippet('bar', ['x', 'y'])).to.equal('bar ${1:x} ${2:y}$0');
  });
});

// Bug verification: BUILTINS contains 'return', which means hovering over
// 'return' in "on return" (keyword position) would incorrectly show builtin docs.
describe('Keyword position detection (isTclKeywordPosition)', () => {
  // --- Bug demonstration: these builtins would cause wrong hover in keyword positions ---
  it('BUILTINS has "return" (proving hover bug exists without keyword detection)', () => {
    expect(BUILTINS).to.have.property('return');
  });

  // --- try...on handler types must be detected as keyword positions ---
  it('detects "error" after "on" as a keyword position', () => {
    // "} on error {msg opts} {" — error is the handler type, not a command
    const line = '} on error {msg opts} {';
    const idx = line.indexOf('error');
    expect(isTclKeywordPosition(line, idx)).to.be.true;
  });

  it('detects "return" after "on" as a keyword position', () => {
    const line = '} on return {result opts} {';
    const idx = line.indexOf('return');
    expect(isTclKeywordPosition(line, idx)).to.be.true;
  });

  it('detects "break" after "on" as a keyword position', () => {
    const line = '} on break {} {';
    const idx = line.indexOf('break');
    expect(isTclKeywordPosition(line, idx)).to.be.true;
  });

  it('detects "continue" after "on" as a keyword position', () => {
    const line = '} on continue {} {';
    const idx = line.indexOf('continue');
    expect(isTclKeywordPosition(line, idx)).to.be.true;
  });

  it('detects "ok" after "on" as a keyword position', () => {
    const line = '} on ok {result opts} {';
    const idx = line.indexOf('ok');
    expect(isTclKeywordPosition(line, idx)).to.be.true;
  });

  it('detects handler keyword regardless of indentation', () => {
    const line = '    } on error {msg opts} {';
    const idx = line.indexOf('error');
    expect(isTclKeywordPosition(line, idx)).to.be.true;
  });

  // --- True positives: same words as commands must NOT be suppressed ---
  it('does not suppress "error" when used as a command', () => {
    const line = 'error "something went wrong"';
    const idx = line.indexOf('error');
    expect(isTclKeywordPosition(line, idx)).to.be.false;
  });

  it('does not suppress "return" when used as a command', () => {
    const line = 'return $result';
    const idx = line.indexOf('return');
    expect(isTclKeywordPosition(line, idx)).to.be.false;
  });

  it('does not suppress "break" when used as a command', () => {
    const line = '  break';
    const idx = line.indexOf('break');
    expect(isTclKeywordPosition(line, idx)).to.be.false;
  });

  it('does not suppress a word whose suffix matches but is not preceded by standalone "on"', () => {
    // "json" ends in "on" but is not the word "on"
    const line = 'json error {some data}';
    const idx = line.indexOf('error');
    expect(isTclKeywordPosition(line, idx)).to.be.false;
  });

  it('does not suppress "ok" when used as a variable name', () => {
    const line = 'set ok 1';
    const idx = line.indexOf('ok');
    expect(isTclKeywordPosition(line, idx)).to.be.false;
  });
});
