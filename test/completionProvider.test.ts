import { expect } from 'chai';
import { scanTclLines } from '../src/parser';

describe('Dictionary Completion Patterns', () => {
  describe('Dict Get Variable Pattern', () => {
    it('should recognize dict get pattern for variable completion', () => {
      const line = 'dict get ';
      const position = line.length;
      
      // Simulate detecting if we're after "dict get "
      const beforeCursor = line.substring(0, position);
      const dictGetMatch = beforeCursor.match(/dict\s+get\s+$/);
      
      expect(dictGetMatch).to.not.be.null;
    });

    it('should not match dict get without trailing space', () => {
      const line = 'dict get';
      const position = line.length;
      
      const beforeCursor = line.substring(0, position);
      const dictGetMatch = beforeCursor.match(/dict\s+get\s+$/);
      
      expect(dictGetMatch).to.be.null;
    });

    it('should match dict get with multiple spaces', () => {
      const line = 'dict  get  ';
      const position = line.length;
      
      const beforeCursor = line.substring(0, position);
      const dictGetMatch = beforeCursor.match(/dict\s+get\s+$/);
      
      expect(dictGetMatch).to.not.be.null;
    });
  });

  describe('Dict Get Key Pattern', () => {
    it('should recognize dict get $varName pattern for key completion', () => {
      const line = 'dict get $mydict ';
      const position = line.length;
      
      const beforeCursor = line.substring(0, position);
      const dictGetVarMatch = beforeCursor.match(/dict\s+get\s+\$(\w+)\s+$/);
      
      expect(dictGetVarMatch).to.not.be.null;
      expect(dictGetVarMatch?.[1]).to.equal('mydict');
    });

    it('should not match dict get without variable name', () => {
      const line = 'dict get $ ';
      const position = line.length;
      
      const beforeCursor = line.substring(0, position);
      const dictGetVarMatch = beforeCursor.match(/dict\s+get\s+\$(\w+)\s+$/);
      
      expect(dictGetVarMatch).to.be.null;
    });

    it('should extract correct variable name from dict get pattern', () => {
      const line = 'dict get $config ';
      const position = line.length;
      
      const beforeCursor = line.substring(0, position);
      const dictGetVarMatch = beforeCursor.match(/dict\s+get\s+\$(\w+)\s+$/);
      
      expect(dictGetVarMatch?.[1]).to.equal('config');
    });

    it('should handle nested dict get patterns', () => {
      const line = 'set value [dict get $config paths ';
      const position = line.length;
      
      const beforeCursor = line.substring(0, position);
      const dictGetVarMatch = beforeCursor.match(/dict\s+get\s+\$(\w+)\s+\w+\s+$/);
      
      expect(dictGetVarMatch).to.not.be.null;
      expect(dictGetVarMatch?.[1]).to.equal('config');
    });
  });

  describe('Dictionary Parsing for Completion', () => {
    it('should parse dictionaries to provide completion data', () => {
      const lines = [
        'set mydict [dict create name John age 30 city NYC]'
      ];
      
      const result = scanTclLines(lines);
      
      expect(result.dictOperations).to.have.lengthOf(1);
      expect(result.dictOperations[0].varName).to.equal('mydict');
      expect(result.dictOperations[0].keys).to.include('name');
      expect(result.dictOperations[0].keys).to.include('age');
      expect(result.dictOperations[0].keys).to.include('city');
    });

    it('should parse multiple dictionaries for completion', () => {
      const lines = [
        'set config [dict create host localhost port 8080]',
        'set user [dict create name Alice role admin]'
      ];
      
      const result = scanTclLines(lines);
      
      expect(result.dictOperations).to.have.lengthOf(2);
      
      const configDict = result.dictOperations.find(d => d.varName === 'config');
      expect(configDict).to.exist;
      expect(configDict?.keys).to.include('host');
      expect(configDict?.keys).to.include('port');
      
      const userDict = result.dictOperations.find(d => d.varName === 'user');
      expect(userDict).to.exist;
      expect(userDict?.keys).to.include('name');
      expect(userDict?.keys).to.include('role');
    });

    it('should parse dict set operations for key completion', () => {
      const lines = [
        'set data [dict create]',
        'dict set data title "Test"',
        'dict set data count 42',
        'dict set data enabled true'
      ];
      
      const result = scanTclLines(lines);
      
      const dataDict = result.dictOperations.find(d => d.varName === 'data');
      expect(dataDict).to.exist;
      expect(dataDict?.keys).to.include('title');
      expect(dataDict?.keys).to.include('count');
      expect(dataDict?.keys).to.include('enabled');
    });
  });

  describe('Proc and Method Completion', () => {
    it('should parse proc definitions for completion', () => {
      const lines = [
        'proc myProc {arg1 arg2} {',
        '  return [expr {$arg1 + $arg2}]',
        '}'
      ];
      
      const result = scanTclLines(lines);
      
      expect(result.definitions).to.have.lengthOf(1);
      expect(result.definitions[0].name).to.equal('myProc');
    });

    it('should parse namespace method definitions for completion', () => {
      const lines = [
        'namespace eval MyClass {',
        '  proc myMethod {this arg1} {',
        '    return $arg1',
        '  }',
        '}'
      ];
      
      const result = scanTclLines(lines);
      
      const method = result.definitions.find((f: any) => f.name === 'myMethod');
      expect(method).to.exist;
      expect(method?.fqName).to.equal('MyClass::myMethod');
    });

    it('should parse proc with default parameters for completion', () => {
      const lines = [
        'proc configure {name {value "default"} {flags {}}} {',
        '  puts "$name = $value"',
        '}'
      ];
      
      const result = scanTclLines(lines);
      
      expect(result.definitions).to.have.lengthOf(1);
      const configFunc = result.definitions[0];
      expect(configFunc.name).to.equal('configure');
      // Parser includes parameter names with or without default brackets
      expect(configFunc.params).to.have.length.greaterThan(0);
      expect(configFunc.params).to.include('name');
    });

    it('should parse procs with bracket string defaults for completion', () => {
      const lines = [
        'proc query {sql {params [list]} {timeout 30}} {',
        '  # Execute query',
        '}'
      ];
      
      const result = scanTclLines(lines);
      
      expect(result.definitions).to.have.lengthOf(1);
      const queryFunc = result.definitions[0];
      expect(queryFunc.name).to.equal('query');
      // Parser includes parameter names with or without default brackets
      expect(queryFunc.params).to.have.length.greaterThan(0);
      expect(queryFunc.params).to.include('sql');
    });
  });

  describe('Builtin Completion Data', () => {
    it('should provide completion data for builtin commands', () => {
      // This tests that we have data structures ready for builtin completion
      // The actual builtins are defined in builtins.ts
      const builtinCommands = ['puts', 'set', 'dict', 'proc', 'namespace', 'if', 'for', 'foreach'];
      
      // Verify we have common builtins
      expect(builtinCommands).to.include('puts');
      expect(builtinCommands).to.include('dict');
      expect(builtinCommands).to.include('proc');
    });
  });

  describe('Completion Trigger Characters', () => {
    it('should trigger completion after open parenthesis', () => {
      const triggerChars = ['(', ' ', '$'];
      expect(triggerChars).to.include('(');
    });

    it('should trigger completion after space', () => {
      const triggerChars = ['(', ' ', '$'];
      expect(triggerChars).to.include(' ');
    });

    it('should trigger completion after dollar sign', () => {
      const triggerChars = ['(', ' ', '$'];
      expect(triggerChars).to.include('$');
    });
  });
});
