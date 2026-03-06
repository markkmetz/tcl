import { expect } from 'chai';
import { collectProcMethodReferences } from '../src/referenceUtils';

describe('Proc/method reference utils', () => {
  it('returns correct count and locations for proc references', () => {
    const lines = [
      'proc foo {} { return 1 }',
      'set x [foo]',
      'foo',
      'set notCall foo',
      'if {$x > 0} { foo }',
      'set y $foo'
    ];

    const refs = collectProcMethodReferences(lines, ['foo']);
    expect(refs).to.have.lengthOf(3);
    expect(refs.map(r => `${r.line}:${r.character}`)).to.deep.equal([
      '1:7',
      '2:0',
      '4:14'
    ]);
  });

  it('matches namespaced method references and ignores declarations', () => {
    const lines = [
      'namespace eval N {',
      '  method bar {} { return ok }',
      '}',
      'N::bar',
      'set cmd N::bar',
      'set z [N::bar]'
    ];

    const refs = collectProcMethodReferences(lines, ['N::bar', 'bar']);
    expect(refs).to.have.lengthOf(2);
    expect(refs.map(r => `${r.line}:${r.character}`)).to.deep.equal([
      '3:0',
      '5:7'
    ]);
  });

  it('handles semicolon-separated commands as links', () => {
    const lines = [
      'proc ping {} { return pong }',
      'set x 1; ping',
      '[ping]'
    ];

    const refs = collectProcMethodReferences(lines, ['ping']);
    expect(refs).to.have.lengthOf(2);
    expect(refs.map(r => `${r.line}:${r.character}`)).to.deep.equal([
      '1:9',
      '2:1'
    ]);
  });
});
