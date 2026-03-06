import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import { scanTclLines } from '../src/parser';

describe('Namespace-aware resolution', () => {
  describe('Namespace tracking in parser', () => {
    it('should identify procs in different namespaces with same name', () => {
      const fixturePath1 = path.join(__dirname, 'fixtures', 'namespace-ns1.tcl');
      const fixturePath2 = path.join(__dirname, 'fixtures', 'namespace-ns2.tcl');
      
      const content1 = fs.readFileSync(fixturePath1, 'utf8');
      const content2 = fs.readFileSync(fixturePath2, 'utf8');
      
      const result1 = scanTclLines(content1.split(/\r?\n/));
      const result2 = scanTclLines(content2.split(/\r?\n/));
      
      // Both have proc 'foo', but in different namespaces
      expect(result1.definitions).to.have.lengthOf(1);
      expect(result2.definitions).to.have.lengthOf(1);
      
      expect(result1.definitions[0].normalizedFqName).to.equal('ns1::foo');
      expect(result2.definitions[0].normalizedFqName).to.equal('ns2::foo');
      
      expect(result1.definitions[0].namespace).to.equal('ns1');
      expect(result2.definitions[0].namespace).to.equal('ns2');
    });

    it('should distinguish global proc from namespaced proc', () => {
      const fixturePath = path.join(__dirname, 'fixtures', 'namespace-global.tcl');
      const content = fs.readFileSync(fixturePath, 'utf8');
      
      const result = scanTclLines(content.split(/\r?\n/));
      
      // Should have both global foo and ns1::foo
      expect(result.definitions).to.have.lengthOf(2);
      
      const globalFoo = result.definitions.find(d => d.normalizedFqName === 'foo');
      const ns1Foo = result.definitions.find(d => d.normalizedFqName === 'ns1::foo');
      
      expect(globalFoo).to.not.be.undefined;
      expect(ns1Foo).to.not.be.undefined;
      
      expect(globalFoo!.namespace).to.be.undefined;
      expect(ns1Foo!.namespace).to.equal('ns1');
    });

    it('should track multiple variables in different namespaces', () => {
      const fixturePath = path.join(__dirname, 'fixtures', 'var-multi-namespace.tcl');
      const content = fs.readFileSync(fixturePath, 'utf8');
      
      const result = scanTclLines(content.split(/\r?\n/));
      
      // Should identify both namespaces
      expect(Array.from(result.fileNamespaces)).to.have.members(['ns1', 'ns2']);
    });
  });

  describe('Namespace and variable parsing documentation', () => {
    it('should document that var-same-file.tcl contains a variable and usage', () => {
      const fixturePath = path.join(__dirname, 'fixtures', 'var-same-file.tcl');
      const content = fs.readFileSync(fixturePath, 'utf8');
      
      // Verify the file structure has a set and a puts
      expect(content).to.include('set myvar');
      expect(content).to.include('puts $myvar');
    });

    it('should document that var-file1.tcl and var-file2.tcl test cross-file globals', () => {
      const fixturePath1 = path.join(__dirname, 'fixtures', 'var-file1.tcl');
      const fixturePath2 = path.join(__dirname, 'fixtures', 'var-file2.tcl');
      
      const content1 = fs.readFileSync(fixturePath1, 'utf8');
      const content2 = fs.readFileSync(fixturePath2, 'utf8');
      
      // File1 defines a global variable
      expect(content1).to.include('set globalvar');
      // File2 tries to use it (should NOT find in actual resolution)
      expect(content2).to.include('puts $globalvar');
    });

    it('should document that namespace variable files test cross-file namespace resolution', () => {
      const fixturePath1 = path.join(__dirname, 'fixtures', 'var-namespace1.tcl');
      const fixturePath2 = path.join(__dirname, 'fixtures', 'var-namespace2.tcl');
      
      const content1 = fs.readFileSync(fixturePath1, 'utf8');
      const content2 = fs.readFileSync(fixturePath2, 'utf8');
      
      // Both should be in ::myns namespace
      expect(content1).to.include('namespace eval ::myns');
      expect(content2).to.include('namespace eval ::myns');
      
      const result1 = scanTclLines(content1.split(/\r?\n/));
      const result2 = scanTclLines(content2.split(/\r?\n/));
      
      // Both should identify the myns namespace
      expect(Array.from(result1.fileNamespaces)).to.include('myns');
      expect(Array.from(result2.fileNamespaces)).to.include('myns');
    });
  });
});
