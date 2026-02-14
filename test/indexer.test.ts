import { expect } from 'chai';
import { parseDefinitionLine, scanTclLines } from '../src/parser';
import * as fs from 'fs';
import * as path from 'path';

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

  it('indexes namespaces, procs, and imports from a sample file', () => {
    const samplePath = path.join(__dirname, 'fixtures', 'sample.tcl');
    const content = fs.readFileSync(samplePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const result = scanTclLines(lines);

    expect(Array.from(result.fileNamespaces)).to.have.members(['ns1', 'ns2', 'Counter']);
    expect(Array.from(result.importedNamespaces)).to.have.members(['ns1']);

    const names = result.definitions.map(d => d.normalizedFqName).sort();
    expect(names).to.deep.equal([
      'Counter::asdffff',
      'Counter::bump',
      'Counter::lol',
      'ns1::bar',
      'ns1::foo',
      'ns1::qux',
      'ns2::baz'
    ]);

    const foo = result.definitions.find(d => d.normalizedFqName === 'ns1::foo');
    expect(foo).to.not.be.undefined;
    expect(foo!.params).to.deep.equal(['a', '{b', '1']);
    expect(foo!.namespace).to.equal('ns1');

    const bar = result.definitions.find(d => d.normalizedFqName === 'ns1::bar');
    expect(bar).to.not.be.undefined;
    expect(bar!.namespace).to.equal('ns1');

    const qux = result.definitions.find(d => d.normalizedFqName === 'ns1::qux');
    expect(qux).to.not.be.undefined;
    expect(qux!.namespace).to.equal('ns1');
    expect(qux!.fqName).to.equal('ns1::qux');

    const counterLol = result.definitions.find(d => d.normalizedFqName === 'Counter::lol');
    expect(counterLol).to.not.be.undefined;
    expect(counterLol!.namespace).to.equal('Counter');

    const counterBump = result.definitions.find(d => d.normalizedFqName === 'Counter::bump');
    expect(counterBump).to.not.be.undefined;
    expect(counterBump!.namespace).to.equal('Counter');

    const counterAsd = result.definitions.find(d => d.normalizedFqName === 'Counter::asdffff');
    expect(counterAsd).to.not.be.undefined;
    expect(counterAsd!.namespace).to.equal('Counter');
  });

  it('indexes a second file with distinct namespaces and similar proc names', () => {
    const otherPath = path.join(__dirname, 'fixtures', 'other.tcl');
    const content = fs.readFileSync(otherPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const result = scanTclLines(lines);

    expect(Array.from(result.fileNamespaces)).to.have.members(['ns3']);
    expect(Array.from(result.importedNamespaces)).to.have.members(['ns1']);

    const names = result.definitions.map(d => d.normalizedFqName).sort();
    expect(names).to.deep.equal(['ns3::foo', 'ns4::bar']);

    const foo = result.definitions.find(d => d.normalizedFqName === 'ns3::foo');
    expect(foo).to.not.be.undefined;
    expect(foo!.params).to.deep.equal(['x', '{y', '2']);
    expect(foo!.namespace).to.equal('ns3');

    const bar = result.definitions.find(d => d.normalizedFqName === 'ns4::bar');
    expect(bar).to.not.be.undefined;
    expect(bar!.params).to.deep.equal(['p', 'q']);
    expect(bar!.namespace).to.equal('ns4');
  });
});
