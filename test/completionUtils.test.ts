import { expect } from 'chai';
import { buildProcSnippet, normalizeProcParams } from '../src/completionUtils';

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
