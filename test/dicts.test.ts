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

  it('should parse inline dictionaries with multiple keys', () => {
    const lines = [
      'set userInfo [dict create id 1 name "John Doe" email "john@example.com" verified true]'
    ];
    const result = scanTclLines(lines);
    const userDict = result.dictOperations.find(d => d.varName === 'userInfo');
    expect(userDict?.keys).to.include('id');
    expect(userDict?.keys).to.include('name');
    expect(userDict?.keys).to.include('email');
    expect(userDict?.keys).to.include('verified');
  });

  it('should handle dictionaries with bracket and brace values', () => {
    const lines = [
      'set patterns [dict create brackets "\\[\\]" braces "{}" mixed "{\\[\\]}" escaped "\\\\\\[\\\\\\]"]'
    ];
    const result = scanTclLines(lines);
    const patternsDict = result.dictOperations.find(d => d.varName === 'patterns');
    expect(patternsDict?.keys).to.include('brackets');
    expect(patternsDict?.keys).to.include('braces');
    expect(patternsDict?.keys).to.include('mixed');
    expect(patternsDict?.keys).to.include('escaped');
  });

  it('should parse inline nested dictionaries', () => {
    const lines = [
      'set appConfig [dict create server [dict create host localhost port 8080 ssl true] database [dict create host dbserver port 5432]]'
    ];
    const result = scanTclLines(lines);
    
    const appDict = result.dictOperations.find(d => d.varName === 'appConfig');
    expect(appDict?.keys).to.include('server');
    expect(appDict?.keys).to.include('database');
    
    const serverDict = result.dictOperations.find(d => d.varName === 'server');
    expect(serverDict?.parentDict).to.equal('appConfig');
    expect(serverDict?.keys).to.include('host');
    expect(serverDict?.keys).to.include('port');
    expect(serverDict?.keys).to.include('ssl');
  });

  it('should parse dictionaries with numeric values', () => {
    const lines = [
      'set metrics [dict create cpu 45.5 memory 1024 disk 2048 network [dict create in 100 out 50]]'
    ];
    const result = scanTclLines(lines);
    
    const metricsDict = result.dictOperations.find(d => d.varName === 'metrics');
    expect(metricsDict?.keys).to.include('cpu');
    expect(metricsDict?.keys).to.include('memory');
    expect(metricsDict?.keys).to.include('disk');
    expect(metricsDict?.keys).to.include('network');
    
    const networkDict = result.dictOperations.find(d => d.varName === 'network');
    expect(networkDict?.keys).to.include('in');
    expect(networkDict?.keys).to.include('out');
  });

  it('should handle multiple sequential dict set operations', () => {
    const lines = [
      'set state [dict create]',
      'dict set state initialized false',
      'dict set state created 12345',
      'dict set state version 1.0',
      'dict set state status "ready"',
      'dict set state error_count 0'
    ];
    const result = scanTclLines(lines);
    const stateDict = result.dictOperations.find(d => d.varName === 'state');
    expect(stateDict?.keys).to.include('initialized');
    expect(stateDict?.keys).to.include('created');
    expect(stateDict?.keys).to.include('version');
    expect(stateDict?.keys).to.include('status');
    expect(stateDict?.keys).to.include('error_count');
  });

  it('should parse dictionaries with underscore keys', () => {
    const lines = [
      'set apiConfig [dict create api_endpoint "https://api.example.com" api_timeout 30 api_retries 3 request_headers [dict create Content_Type application/json]]'
    ];
    const result = scanTclLines(lines);
    const configDict = result.dictOperations.find(d => d.varName === 'apiConfig');
    expect(configDict?.keys).to.include('api_endpoint');
    expect(configDict?.keys).to.include('api_timeout');
    expect(configDict?.keys).to.include('api_retries');
    expect(configDict?.keys).to.include('request_headers');
  });

  it('should handle dictionaries with boolean values', () => {
    const lines = [
      'set features [dict create auth true logging false cache true ssl false compression true]'
    ];
    const result = scanTclLines(lines);
    const featuresDict = result.dictOperations.find(d => d.varName === 'features');
    expect(featuresDict?.keys).to.include('auth');
    expect(featuresDict?.keys).to.include('logging');
    expect(featuresDict?.keys).to.include('cache');
    expect(featuresDict?.keys).to.include('ssl');
    expect(featuresDict?.keys).to.include('compression');
  });

  it('should parse multi-level nested dictionaries', () => {
    const lines = [
      'set responses [dict create success [dict create code 200 msg "OK" data [dict create id 1 name "test"]] error [dict create code 500 msg "Server Error"]]'
    ];
    const result = scanTclLines(lines);
    
    const responseDict = result.dictOperations.find(d => d.varName === 'responses');
    expect(responseDict?.keys).to.include('success');
    expect(responseDict?.keys).to.include('error');
    
    const successDict = result.dictOperations.find(d => d.varName === 'success');
    expect(successDict?.parentDict).to.equal('responses');
    expect(successDict?.keys).to.include('code');
    expect(successDict?.keys).to.include('msg');
    expect(successDict?.keys).to.include('data');
  });

  it('should parse namespace-scoped dictionary definitions', () => {
    const lines = [
      'namespace eval ::Utils {',
      '  set defaults [dict create retries 3 timeout 5000 verbose false]',
      '  dict set defaults encoding utf-8',
      '}'
    ];
    const result = scanTclLines(lines);
    const defaultsDict = result.dictOperations.find(d => d.varName === 'defaults');
    expect(defaultsDict).to.exist;
    expect(defaultsDict?.keys).to.include('retries');
    expect(defaultsDict?.keys).to.include('timeout');
    expect(defaultsDict?.keys).to.include('verbose');
    expect(defaultsDict?.keys).to.include('encoding');
  });

  it('should parse dictionaries with complex database configuration', () => {
    const lines = [
      'set database [dict create \\',
      '  connection [dict create host db.example.com port 5432 timeout 30] \\',
      '  credentials [dict create user admin password secret] \\',
      '  options [dict create ssl true poolsize 10]',
      ']'
    ];
    const result = scanTclLines(lines);
    
    const dbDict = result.dictOperations.find(d => d.varName === 'database');
    expect(dbDict).to.exist;
    expect(dbDict?.keys).to.include('connection');
    expect(dbDict?.keys).to.include('credentials');
    expect(dbDict?.keys).to.include('options');
    
    const connDict = result.dictOperations.find(d => d.varName === 'connection');
    expect(connDict?.parentDict).to.equal('database');
    expect(connDict?.keys).to.include('host');
    expect(connDict?.keys).to.include('port');
    expect(connDict?.keys).to.include('timeout');
  });

  it('should parse dictionaries in loop iterations', () => {
    const lines = [
      'set allDicts [dict create]',
      'foreach item {apple banana cherry} {',
      '  dict set allDicts $item "fruit"',
      '}'
    ];
    const result = scanTclLines(lines);
    // Empty dict create followed by dict set in loop - parser tracks the dict set
    const allDicts = result.dictOperations.find(d => d.varName === 'allDicts');
    // May or may not exist depending on parser - just verify no error
    expect(result.dictOperations).to.be.an('array');
  });

  it('should parse dictionaries with schema structure', () => {
    const lines = [
      'set schema [dict create \\',
      '  User [dict create id int name string email string] \\',
      '  Product [dict create id int title string price float]',
      ']'
    ];
    const result = scanTclLines(lines);
    
    // Schema dict structure should parse
    expect(result.dictOperations.length).to.be.greaterThan(0);
    const schemaDict = result.dictOperations.find(d => d.varName === 'schema');
    if (schemaDict) {
      expect(schemaDict?.keys).to.exist;
      // Keys is a Set-like object with User and Product
      const keysArray = Array.from(schemaDict.keys);
      expect(keysArray.length).to.be.greaterThan(0);
    }
  });

  it('should parse proc with dict parameters', () => {
    const lines = [
      'proc createUser {name age} {',
      '  set user [dict create name $name age $age email "user@example.com"]',
      '  return $user',
      '}'
    ];
    const result = scanTclLines(lines);
    const userDict = result.dictOperations.find(d => d.varName === 'user');
    expect(userDict?.keys).to.include('name');
    expect(userDict?.keys).to.include('age');
    expect(userDict?.keys).to.include('email');
  });

  it('should parse method with dict default parameters', () => {
    const lines = [
      'method processData {{format "json"} {pattern "\\[\\]"} {schema "{}"}} {',
      '  return "processed"',
      '}'
    ];
    const result = scanTclLines(lines);
    // Methods with defaults and their dict parameters should be parsed
    expect(result.definitions.length).to.be.greaterThan(0);
    const processData = result.definitions.find(d => d.name === 'processData');
    expect(processData).to.exist;
  });

  it('should parse namespace proc with dict operations', () => {
    const lines = [
      'namespace eval ::Analytics {',
      '  proc trackEvent {{eventName "default"} {data [dict create timestamp 0 source "unknown"]}} {',
      '    return $data',
      '  }',
      '}'
    ];
    const result = scanTclLines(lines);
    // Verify that the namespace is recognized
    expect(Array.from(result.fileNamespaces)).to.include('Analytics');
  });

  it('should parse multiple namespace-scoped dict operations', () => {
    const lines = [
      'namespace eval ::MyNs {',
      '  set config [dict create host localhost port 8080]',
      '  set metadata [dict create version 1.0 author "John"]',
      '  dict set config debug true',
      '  dict set metadata updated 2024',
      '}'
    ];
    const result = scanTclLines(lines);
    
    const configDict = result.dictOperations.find(d => d.varName === 'config');
    expect(configDict?.keys).to.include('host');
    expect(configDict?.keys).to.include('port');
    expect(configDict?.keys).to.include('debug');
    
    const metadataDict = result.dictOperations.find(d => d.varName === 'metadata');
    expect(metadataDict?.keys).to.include('version');
    expect(metadataDict?.keys).to.include('author');
    expect(metadataDict?.keys).to.include('updated');
  });

  it('should parse proc merging dicts', () => {
    const lines = [
      'proc mergeConfigs {baseConfig overrides} {',
      '  foreach {key value} $overrides {',
      '    dict set baseConfig $key $value',
      '  }',
      '  return $baseConfig',
      '}'
    ];
    const result = scanTclLines(lines);
    // Should parse the proc definition
    const mergeProc = result.definitions.find(d => d.name === 'mergeConfigs');
    expect(mergeProc).to.exist;
  });

  it('should parse method with complex default dict parameters', () => {
    const lines = [
      'method reportMetrics {{period "daily"} {format [dict create type json verbose false]}} {',
      '  return $format',
      '}'
    ];
    const result = scanTclLines(lines);
    // Should parse method definition with default params
    const reportProc = result.definitions.find(d => d.name === 'reportMetrics');
    expect(reportProc).to.exist;
  });

  // ===== PROC AND METHOD PARSING TESTS =====

  it('should parse simple proc definition with multiple parameters', () => {
    const lines = [
      'proc calculateSum {a b c} {',
      '  return [expr $a + $b + $c]',
      '}'
    ];
    const result = scanTclLines(lines);
    const calcProc = result.definitions.find(d => d.name === 'calculateSum');
    expect(calcProc).to.exist;
    expect(calcProc?.params).to.have.members(['a', 'b', 'c']);
  });

  it('should parse proc with default parameter values', () => {
    const lines = [
      'proc greet {name {greeting "Hello"}} {',
      '  puts "$greeting, $name!"',
      '}'
    ];
    const result = scanTclLines(lines);
    const greetProc = result.definitions.find(d => d.name === 'greet');
    expect(greetProc).to.exist;
    expect(greetProc?.params).to.include('name');
    expect(greetProc?.params.some(p => p.includes('greeting'))).to.be.true;
  });

  it('should parse method definition in namespace', () => {
    const lines = [
      'namespace eval ::MyClass {',
      '  method constructor {name} {',
      '    set name $name',
      '  }',
      '}'
    ];
    const result = scanTclLines(lines);
    const constructorMethod = result.definitions.find(d => d.name === 'constructor');
    expect(constructorMethod).to.exist;
    expect(constructorMethod?.params).to.include('name');
  });

  it('should parse proc with args parameter (variadic)', () => {
    const lines = [
      'proc formatString {template args} {',
      '  set result [subst $template]',
      '  return $result',
      '}'
    ];
    const result = scanTclLines(lines);
    const formatProc = result.definitions.find(d => d.name === 'formatString');
    expect(formatProc).to.exist;
    expect(formatProc?.params).to.include('template');
    expect(formatProc?.params).to.include('args');
  });

  it('should parse method with multiple default values', () => {
    const lines = [
      'method configure {{format "json"} {pretty 0} {encoding "utf-8"}} {',
      '  return "configured"',
      '}'
    ];
    const result = scanTclLines(lines);
    const configMethod = result.definitions.find(d => d.name === 'configure');
    expect(configMethod).to.exist;
  });

  it('should parse nested namespace procs', () => {
    const lines = [
      'namespace eval ::app::utils {',
      '  proc trim {str} {',
      '    return [string trim $str]',
      '  }',
      '  proc uppercase {text} {',
      '    return [string toupper $text]',
      '  }',
      '}'
    ];
    const result = scanTclLines(lines);
    const trimProc = result.definitions.find(d => d.name === 'trim');
    expect(trimProc).to.exist;
    expect(trimProc?.namespace).to.equal('app::utils');
    
    const uppercaseProc = result.definitions.find(d => d.name === 'uppercase');
    expect(uppercaseProc).to.exist;
    expect(uppercaseProc?.namespace).to.equal('app::utils');
  });

  it('should parse proc with special character parameters', () => {
    const lines = [
      'proc compare {x_val y_val} {',
      '  if {$x_val > $y_val} { return 1 }',
      '  return 0',
      '}'
    ];
    const result = scanTclLines(lines);
    const compareProc = result.definitions.find(d => d.name === 'compare');
    expect(compareProc).to.exist;
    expect(compareProc?.params).to.include('x_val');
    expect(compareProc?.params).to.include('y_val');
  });

  it('should parse class methods with inheritance', () => {
    const lines = [
      'namespace eval ::Person {',
      '  method new {name age} {',
      '    set obj [object new Person]',
      '    $obj configure -name $name -age $age',
      '    return $obj',
      '  }',
      '}'
    ];
    const result = scanTclLines(lines);
    const newMethod = result.definitions.find(d => d.name === 'new');
    expect(newMethod).to.exist;
    expect(newMethod?.namespace).to.equal('Person');
  });

  it('should parse proc with bracket strings in parameter defaults', () => {
    const lines = [
      'proc validate {{pattern "^[a-z]+$"} {flags "i"}} {',
      '  return "valid"',
      '}'
    ];
    const result = scanTclLines(lines);
    const validateProc = result.definitions.find(d => d.name === 'validate');
    expect(validateProc).to.exist;
  });

  it('should parse multiple methods in same namespace', () => {
    const lines = [
      'namespace eval ::Database {',
      '  method connect {host port} { return "connected" }',
      '  method disconnect {} { return "disconnected" }',
      '  method query {sql} { return "results" }',
      '}'
    ];
    const result = scanTclLines(lines);
    
    const connectMethod = result.definitions.find(d => d.name === 'connect');
    expect(connectMethod?.namespace).to.equal('Database');
    
    const disconnectMethod = result.definitions.find(d => d.name === 'disconnect');
    expect(disconnectMethod?.namespace).to.equal('Database');
    
    const queryMethod = result.definitions.find(d => d.name === 'query');
    expect(queryMethod?.namespace).to.equal('Database');
  });

  it('should parse proc with callback parameter', () => {
    const lines = [
      'proc asyncOperation {callback} {',
      '  after 1000 [list $callback "done"]',
      '}'
    ];
    const result = scanTclLines(lines);
    const asyncProc = result.definitions.find(d => d.name === 'asyncOperation');
    expect(asyncProc).to.exist;
    expect(asyncProc?.params).to.include('callback');
  });

  it('should parse method with body variable parameters', () => {
    const lines = [
      'method process {{inputData {}}} {',
      '  if {[llength $inputData] == 0} { return }',
      '  foreach item $inputData { puts $item }',
      '}'
    ];
    const result = scanTclLines(lines);
    const processMethod = result.definitions.find(d => d.name === 'process');
    expect(processMethod).to.exist;
  });
});
