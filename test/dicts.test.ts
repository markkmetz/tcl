import { expect } from 'chai';
import { scanTclLines } from '../src/parser';

describe('Dictionary Parsing', () => {
  it('should parse dict create with keys', () => {
    const lines = [
      'set mydict [dict create name John age 30 email user@example.com]'
    ];
    const result = scanTclLines(lines);
    expect(result.dictOperations).to.have.lengthOf(1);
    expect(result.dictOperations[0].varName).to.equal('mydict');
    expect(result.dictOperations[0].keys).to.deep.include('name');
    expect(result.dictOperations[0].keys).to.deep.include('age');
    expect(result.dictOperations[0].keys).to.deep.include('email');
  });

  it('should parse dict set operations', () => {
    const lines = [
      'set config [dict create]',
      'dict set config host localhost',
      'dict set config port 8080'
    ];
    const result = scanTclLines(lines);
    expect(result.dictOperations).to.have.length.greaterThan(0);
    const configDict = result.dictOperations.find(d => d.varName === 'config');
    expect(configDict).to.exist;
    expect(configDict?.keys).to.include('host');
    expect(configDict?.keys).to.include('port');
  });

  it('should not include variable substitutions as keys', () => {
    const lines = [
      'set mydict [dict create name $userName age $userAge]'
    ];
    const result = scanTclLines(lines);
    expect(result.dictOperations).to.have.lengthOf(1);
    // Should only have 'name' and 'age', not $userName or $userAge
    expect(result.dictOperations[0].keys).to.have.lengthOf(2);
    expect(result.dictOperations[0].keys).to.deep.include('name', 'age');
  });

  it('should track multiple dict set updates on same variable', () => {
    const lines = [
      'dict set user name Alice',
      'dict set user age 25',
      'dict set user age 26'  // update existing key
    ];
    const result = scanTclLines(lines);
    const userDict = result.dictOperations.find(d => d.varName === 'user');
    expect(userDict).to.exist;
    expect(userDict?.keys).to.include('name');
    expect(userDict?.keys).to.include('age');
    // age should only be listed once despite being set twice
    expect(userDict?.keys.filter((k: string) => k === 'age')).to.have.lengthOf(1);
  });

  it('should handle single-line multi-key dict operations', () => {
    const lines = [
      'set config [dict create host "localhost" port 8080 debug true debug_level 5]'
    ];
    const result = scanTclLines(lines);
    expect(result.dictOperations).to.have.lengthOf(1);
    const config = result.dictOperations[0];
    expect(config.keys).to.include('host');
    expect(config.keys).to.include('port');
    expect(config.keys).to.include('debug');
    expect(config.keys).to.include('debug_level');
  });

  it('should track nested dicts', () => {
    const lines = [
      'set outer [dict create inner [dict create key1 val1 key2 val2]]'
    ];
    const result = scanTclLines(lines);
    expect(result.dictOperations.length).to.be.greaterThan(0);
    const outerDict = result.dictOperations.find(d => d.varName === 'outer');
    expect(outerDict).to.exist;
    expect(outerDict?.keys).to.include('inner');
  });

  it('should track dictionaries in namespace eval', () => {
    const lines = [
      'namespace eval ::MyNs {',
      '  set nsdict [dict create data "value"]',
      '  dict set nsdict status "active"',
      '}'
    ];
    const result = scanTclLines(lines);
    const nsDict = result.dictOperations.find(d => d.varName === 'nsdict');
    expect(nsDict).to.exist;
    expect(nsDict?.keys).to.include('data');
    expect(nsDict?.keys).to.include('status');
  });

  it('should parse multiple dictionary variables in one scan', () => {
    const lines = [
      'set dict1 [dict create key1 val1 key2 val2]',
      'set dict2 [dict create keyA valA keyB valB]',
      'dict set dict1 key3 val3'
    ];
    const result = scanTclLines(lines);
    expect(result.dictOperations.length).to.equal(2);
    
    const dict1 = result.dictOperations.find(d => d.varName === 'dict1');
    expect(dict1?.keys).to.include('key1');
    expect(dict1?.keys).to.include('key2');
    expect(dict1?.keys).to.include('key3');
    
    const dict2 = result.dictOperations.find(d => d.varName === 'dict2');
    expect(dict2?.keys).to.include('keyA');
    expect(dict2?.keys).to.include('keyB');
  });

  it('should handle empty dict create', () => {
    const lines = [
      'set emptyDict [dict create]'
    ];
    const result = scanTclLines(lines);
    // Empty dict create shouldn't be added to dictOperations (no keys)
    const emptyDict = result.dictOperations.find(d => d.varName === 'emptyDict');
    expect(emptyDict).to.be.undefined;
  });

  it('should accumulate keys across multiple dict set calls on same variable', () => {
    const lines = [
      'dict set mydict key1 val1',
      'dict set mydict key2 val2',
      'dict set mydict key3 val3',
      'dict set mydict key1 newval1'  // update existing
    ];
    const result = scanTclLines(lines);
    const mydict = result.dictOperations.find(d => d.varName === 'mydict');
    expect(mydict?.keys).to.include('key1');
    expect(mydict?.keys).to.include('key2');
    expect(mydict?.keys).to.include('key3');
    // Should have exactly 3 unique keys
    expect(mydict?.keys.length).to.equal(3);
  });

  it('should parse dict with quoted values', () => {
    const lines = [
      'set options [dict create title MyTitle description Value1 enabled true]'
    ];
    const result = scanTclLines(lines);
    const options = result.dictOperations.find(d => d.varName === 'options');
    expect(options?.keys).to.include('title');
    expect(options?.keys).to.include('description');
    expect(options?.keys).to.include('enabled');
  });

  it('should handle dict create with special characters in keys', () => {
    const lines = [
      'set config [dict create db_host localhost db_port 5432 api_key "secret"]'
    ];
    const result = scanTclLines(lines);
    const config = result.dictOperations.find(d => d.varName === 'config');
    expect(config?.keys).to.include('db_host');
    expect(config?.keys).to.include('db_port');
    expect(config?.keys).to.include('api_key');
  });

  it('should parse nested dictionaries with parent reference', () => {
    const lines = [
      'set config [dict create host localhost paths [dict create data "/var/data" logs "/var/logs"]]'
    ];
    const result = scanTclLines(lines);
    
    // Parent dict should have 'paths' as a key
    const configDict = result.dictOperations.find(d => d.varName === 'config');
    expect(configDict?.keys).to.include('host');
    expect(configDict?.keys).to.include('paths');
    
    // Nested dict should have parent reference
    const pathsDict = result.dictOperations.find(d => d.varName === 'paths');
    expect(pathsDict?.parentDict).to.equal('config');
    expect(pathsDict?.keys).to.include('data');
    expect(pathsDict?.keys).to.include('logs');
  });

  it('should track deeply nested dictionaries', () => {
    const lines = [
      'set root [dict create level1 [dict create level2 [dict create key value]]]'
    ];
    const result = scanTclLines(lines);
    
    const rootDict = result.dictOperations.find(d => d.varName === 'root');
    expect(rootDict?.keys).to.include('level1');
    
    const level1 = result.dictOperations.find(d => d.varName === 'level1');
    expect(level1?.parentDict).to.equal('root');
    expect(level1?.keys).to.include('level2');
  });

  it('should allow looking up which dicts contain a key', () => {
    const lines = [
      'set config [dict create host localhost port 8080]',
      'set defaults [dict create host default_host timeout 30]'
    ];
    const result = scanTclLines(lines);
    
    // Both config and defaults dicts have 'host' key
    const configDict = result.dictOperations.find(d => d.varName === 'config');
    expect(configDict?.keys).to.include('host');
    
    const defaultsDict = result.dictOperations.find(d => d.varName === 'defaults');
    expect(defaultsDict?.keys).to.include('host');
  });
});
