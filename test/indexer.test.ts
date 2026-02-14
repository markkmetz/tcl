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
      'Counter::add',
      'Counter::asdffff',
      'Counter::bump',
      'Counter::lol',
      'gproc',
      'ns1::bar',
      'ns1::foo',
      'ns1::qux',
      'ns1::zap',
      'ns2::baz',
      'ns2::buzz'
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

    const zap = result.definitions.find(d => d.normalizedFqName === 'ns1::zap');
    expect(zap).to.not.be.undefined;
    expect(zap!.params).to.deep.equal(['p', '{q', '2']);
    expect(zap!.namespace).to.equal('ns1');

    const counterLol = result.definitions.find(d => d.normalizedFqName === 'Counter::lol');
    expect(counterLol).to.not.be.undefined;
    expect(counterLol!.namespace).to.equal('Counter');

    const counterBump = result.definitions.find(d => d.normalizedFqName === 'Counter::bump');
    expect(counterBump).to.not.be.undefined;
    expect(counterBump!.namespace).to.equal('Counter');

    const counterAsd = result.definitions.find(d => d.normalizedFqName === 'Counter::asdffff');
    expect(counterAsd).to.not.be.undefined;
    expect(counterAsd!.namespace).to.equal('Counter');

    const counterAdd = result.definitions.find(d => d.normalizedFqName === 'Counter::add');
    expect(counterAdd).to.not.be.undefined;
    expect(counterAdd!.params).to.deep.equal(['x', '{y', '10']);
    expect(counterAdd!.namespace).to.equal('Counter');

    const buzz = result.definitions.find(d => d.normalizedFqName === 'ns2::buzz');
    expect(buzz).to.not.be.undefined;
    expect(buzz!.params).to.deep.equal(['a', '{b', '9']);
    expect(buzz!.namespace).to.equal('ns2');

    const gproc = result.definitions.find(d => d.normalizedFqName === 'gproc');
    expect(gproc).to.not.be.undefined;
    expect(gproc!.params).to.deep.equal(['m', '{n', '5']);
    expect(gproc!.namespace).to.be.undefined;
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

  it('parses dictionary operations from dicts.tcl fixture', () => {
    const dictsPath = path.join(__dirname, 'fixtures', 'dicts.tcl');
    const content = fs.readFileSync(dictsPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const result = scanTclLines(lines);

    expect(result.dictOperations.length).to.be.greaterThan(0);

    // Check for user dict from namespace
    const userDict = result.dictOperations.find(d => d.varName === 'user');
    expect(userDict).to.exist;
    expect(userDict?.keys).to.include('name');
    expect(userDict?.keys).to.include('age');
    expect(userDict?.keys).to.include('email');

    // Check for config dict (multiline continuation is now supported)
    const configDict = result.dictOperations.find(d => d.varName === 'config');
    expect(configDict).to.exist;
    expect(configDict?.keys).to.include('debug');
    expect(configDict?.keys).to.include('paths');

    // Check for settings dict
    const settingsDict = result.dictOperations.find(d => d.varName === 'settings');
    expect(settingsDict).to.exist;
    expect(settingsDict?.keys).to.include('theme');
    expect(settingsDict?.keys).to.include('language');
    expect(settingsDict?.keys).to.include('timezone');

    // Check for cache dict with updates
    const cacheDict = result.dictOperations.find(d => d.varName === 'cache');
    expect(cacheDict).to.exist;
    expect(cacheDict?.keys).to.include('expires');
    expect(cacheDict?.keys).to.include('ttl');
    expect(cacheDict?.keys).to.include('maxsize');
    expect(cacheDict?.keys).to.include('compression');

    // Note: allDicts is created empty in a loop, so it won't have keys in a simple parse

    // Check for namespace-scoped defaults dict
    const defaults = result.dictOperations.find(d => d.varName === 'defaults');
    expect(defaults).to.exist;
    expect(defaults?.keys).to.include('retries');
    expect(defaults?.keys).to.include('timeout');
    expect(defaults?.keys).to.include('verbose');
    expect(defaults?.keys).to.include('encoding');

    // Check for nested database config
    const database = result.dictOperations.find(d => d.varName === 'database');
    expect(database).to.exist;
    expect(database?.keys).to.include('connection');
    expect(database?.keys).to.include('credentials');
    expect(database?.keys).to.include('options');

    // Check nested dicts have parent references
    const connection = result.dictOperations.find(d => d.varName === 'connection');
    expect(connection?.parentDict).to.equal('database');
    expect(connection?.keys).to.include('host');
    expect(connection?.keys).to.include('port');
    expect(connection?.keys).to.include('timeout');

    const credentials = result.dictOperations.find(d => d.varName === 'credentials');
    expect(credentials?.parentDict).to.equal('database');
    expect(credentials?.keys).to.include('user');
    expect(credentials?.keys).to.include('password');

    const options = result.dictOperations.find(d => d.varName === 'options');
    expect(options?.parentDict).to.equal('database');
    expect(options?.keys).to.include('ssl');
    expect(options?.keys).to.include('poolsize');
  });
});
