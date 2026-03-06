import { expect } from 'chai';

describe('Dictionary Command Completion Patterns', () => {
  describe('Dict Set Pattern', () => {
    it('should recognize dict set pattern for key completion', () => {
      const text = 'dict set mydict ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('set');
        expect(match[2]).to.equal('mydict');
      }
    });

    it('should recognize dict set with dollar sign (also valid)', () => {
      const text = 'dict set $mydict ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('set');
        expect(match[2]).to.equal('mydict');
      }
    });

    it('should recognize dict set with partial key', () => {
      const text = 'dict set mydict ke';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('set');
        expect(match[2]).to.equal('mydict');
        expect(match[3]).to.equal('ke');
      }
    });
  });

  describe('Dict Lappend Pattern', () => {
    it('should recognize dict lappend pattern', () => {
      const text = 'dict lappend config ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('lappend');
        expect(match[2]).to.equal('config');
      }
    });
  });

  describe('Dict Incr Pattern', () => {
    it('should recognize dict incr pattern', () => {
      const text = 'dict incr counter ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('incr');
        expect(match[2]).to.equal('counter');
      }
    });
  });

  describe('Dict Append Pattern', () => {
    it('should recognize dict append pattern', () => {
      const text = 'dict append data ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('append');
        expect(match[2]).to.equal('data');
      }
    });
  });

  describe('Dict Variable Suggestion Pattern', () => {
    it('should recognize dict set without variable for variable completion', () => {
      const text = 'dict set ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('set');
        expect(match[2]).to.equal('');
      }
    });

    it('should recognize dict lappend with partial variable name', () => {
      const text = 'dict lappend $my';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('lappend');
        expect(match[2]).to.equal('my');
      }
    });

    it('should not match when key is already present', () => {
      const text = 'dict set $mydict key ';
      const noKeyMatch = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w*)$/);
      const shouldNotMatchVar = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?\w+\s+\w/);
      
      expect(noKeyMatch).to.be.null;
      expect(shouldNotMatchVar).to.not.be.null;
    });
  });

  describe('Dict Unset Pattern', () => {
    it('should recognize dict unset pattern', () => {
      const text = 'dict unset config ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('unset');
        expect(match[2]).to.equal('config');
      }
    });
  });

  describe('Dict Exists Pattern', () => {
    it('should recognize dict exists pattern', () => {
      const text = 'dict exists mydict ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('exists');
        expect(match[2]).to.equal('mydict');
      }
    });
  });

  describe('Dict Update Pattern', () => {
    it('should recognize dict update pattern', () => {
      const text = 'dict update config ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('update');
        expect(match[2]).to.equal('config');
      }
    });
  });

  describe('Multiple Key-Value Pairs', () => {
    it('should recognize position after first key-value pair for dict set', () => {
      const text = 'dict set mydict name "John" ';
      const pattern = /dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/;
      const match = text.match(pattern);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('set');
        expect(match[2]).to.equal('mydict');
        const afterVar = match[3];
        // Should have 2 tokens: name and "John"
        expect(afterVar.trim()).to.include('name');
        expect(afterVar.trim()).to.include('"John"');
      }
    });

    it('should recognize position after second key-value pair', () => {
      const text = 'dict set mydict name John age 25 ';
      const pattern = /dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/;
      const match = text.match(pattern);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('set');
        expect(match[2]).to.equal('mydict');
        const afterVar = match[3];
        // Should have 4 tokens: name, John, age, 25
        expect(afterVar.trim()).to.equal('name John age 25');
      }
    });

    it('should recognize partial key after value', () => {
      const text = 'dict set mydict name John em';
      const pattern = /dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$?(\w+)\s+(.*)$/;
      const match = text.match(pattern);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('set');
        expect(match[2]).to.equal('mydict');
        const afterVar = match[3];
        expect(afterVar.trim()).to.equal('name John em');
      }
    });
  });

  describe('Used Key Filtering', () => {
    it('should extract used keys from token array', () => {
      const tokens = ['name', '"John"', 'age', '30'];
      const usedKeys = new Set<string>();
      for (let i = 0; i < tokens.length; i += 2) {
        usedKeys.add(tokens[i].replace(/^["']|["']$/g, ''));
      }
      expect(usedKeys.has('name')).to.be.true;
      expect(usedKeys.has('age')).to.be.true;
      expect(usedKeys.has('John')).to.be.false;
      expect(usedKeys.has('30')).to.be.false;
    });

    it('should extract quoted keys correctly', () => {
      const tokens = ['"firstName"', 'John', '"lastName"', 'Doe'];
      const usedKeys = new Set<string>();
      for (let i = 0; i < tokens.length; i += 2) {
        usedKeys.add(tokens[i].replace(/^["']|["']$/g, ''));
      }
      expect(usedKeys.has('firstName')).to.be.true;
      expect(usedKeys.has('lastName')).to.be.true;
    });

    it('should handle empty tokens array', () => {
      const tokens: string[] = [];
      const usedKeys = new Set<string>();
      for (let i = 0; i < tokens.length; i += 2) {
        usedKeys.add(tokens[i].replace(/^["']|["']$/g, ''));
      }
      expect(usedKeys.size).to.equal(0);
    });
  });
});
