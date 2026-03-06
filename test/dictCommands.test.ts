import { expect } from 'chai';

describe('Dictionary Command Completion Patterns', () => {
  describe('Dict Set Pattern', () => {
    it('should recognize dict set pattern for key completion', () => {
      const text = 'dict set $mydict ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$(\w+)\s+([\w]*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('set');
        expect(match[2]).to.equal('mydict');
      }
    });

    it('should recognize dict set with dollar sign', () => {
      const text = 'dict set $mydict ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$(\w+)\s+([\w]*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('set');
        expect(match[2]).to.equal('mydict');
      }
    });

    it('should recognize dict set with partial key', () => {
      const text = 'dict set $mydict ke';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$(\w+)\s+([\w]*)$/);
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
      const text = 'dict lappend $config ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$(\w+)\s+([\w]*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('lappend');
        expect(match[2]).to.equal('config');
      }
    });
  });

  describe('Dict Incr Pattern', () => {
    it('should recognize dict incr pattern', () => {
      const text = 'dict incr $counter ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$(\w+)\s+([\w]*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('incr');
        expect(match[2]).to.equal('counter');
      }
    });
  });

  describe('Dict Append Pattern', () => {
    it('should recognize dict append pattern', () => {
      const text = 'dict append $data ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$(\w+)\s+([\w]*)$/);
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
      const text = 'dict unset $config ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$(\w+)\s+([\w]*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('unset');
        expect(match[2]).to.equal('config');
      }
    });
  });

  describe('Dict Exists Pattern', () => {
    it('should recognize dict exists pattern', () => {
      const text = 'dict exists $mydict ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$(\w+)\s+([\w]*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('exists');
        expect(match[2]).to.equal('mydict');
      }
    });
  });

  describe('Dict Update Pattern', () => {
    it('should recognize dict update pattern', () => {
      const text = 'dict update $config ';
      const match = text.match(/dict\s+(set|lappend|incr|unset|append|exists|update|remove|replace)\s+\$(\w+)\s+([\w]*)$/);
      expect(match).to.not.be.null;
      if (match) {
        expect(match[1]).to.equal('update');
        expect(match[2]).to.equal('config');
      }
    });
  });
});
