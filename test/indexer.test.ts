import { expect } from 'chai';
import { parseDefinitionLine } from '../src/parser';

describe('Tcl indexer parsing', () => {
  it('parses a proc with two params', () => {
    const line = 'proc abc {var1 var2} { puts $var1 }';
    const res = parseDefinitionLine(line);
    expect(res).to.not.be.null;
    expect(res!.type).to.equal('proc');
    expect(res!.name).to.equal('abc');
    expect(res!.params).to.deep.equal(['var1', 'var2']);
  });

  it('parses a method with single param', () => {
    const line = '  method doThing {x} { # body }';
    const res = parseDefinitionLine(line);
    expect(res).to.not.be.null;
    expect(res!.type).to.equal('method');
    expect(res!.name).to.equal('doThing');
    expect(res!.params).to.deep.equal(['x']);
  });

  it('returns null for non-definition lines', () => {
    const line = 'set a 1';
    const res = parseDefinitionLine(line);
    expect(res).to.be.null;
  });
});
