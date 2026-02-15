import { expect } from 'chai';
import { extractVariableReferenceSpans } from '../src/semanticVariables';

describe('TCL semantic variable references', () => {
  const extractVariables = (line: string): string[] => {
    return extractVariableReferenceSpans(line).map(span => line.slice(span.start, span.start + span.length));
  };

  it('should extract variable references in plain text', () => {
    const line = 'puts $name and $count';
    expect(extractVariables(line)).to.deep.equal(['$name', '$count']);
  });

  it('should extract variable references inside quoted strings', () => {
    const line = 'puts "User $user has value $value"';
    expect(extractVariables(line)).to.deep.equal(['$user', '$value']);
  });

  it('should extract namespace variable references', () => {
    const line = 'set x $::Config::timeout';
    expect(extractVariables(line)).to.deep.equal(['$::Config::timeout']);
  });

  it('should ignore escaped dollar variables', () => {
    const line = 'puts "literal \\$name but real $name"';
    expect(extractVariables(line)).to.deep.equal(['$name']);
  });
});
