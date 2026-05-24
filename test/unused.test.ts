import { expect } from 'chai';
import { collectLightweightSyntaxIssues } from '../src/syntaxCheckerUtils';

describe('Unused variable and proc detection', () => {
  it('skips unused heuristics when syntax-only mode is requested', () => {
    const lines = [
      'set foo 1',
      'proc helper {x} { puts $x }',
      'puts done',
    ];

    const issues = collectLightweightSyntaxIssues(lines, { includeUsageAnalysis: false });
    const unusedIssues = issues.filter(i => /Possible unused (variable|proc)/.test(i.message));
    expect(unusedIssues).to.have.lengthOf(0);
  });

  it('does not report unused when dynamic pattern is used', () => {
    const lines = [
      'set letter a',
      'set variable$letter "x"',
      'puts $variableb',
      'puts $variablea',
    ];

    const issues = collectLightweightSyntaxIssues(lines);
    // Should not report unused variable for variable$letter
    const varIssues = issues.filter(i => /variable\$letter/.test(i.message));
    expect(varIssues).to.have.lengthOf(0);
  });

  it('reports unused variable when no usage', () => {
    const lines = [
      'set foo 1',
      'puts $bar',
    ];
    const issues = collectLightweightSyntaxIssues(lines);
    const varIssues = issues.filter(i => /foo/.test(i.message));
    expect(varIssues.length).to.be.greaterThan(0);
  });

  it('does not report unused proc when invoked', () => {
    const lines = [
      'proc addTwo {a b} { expr {$a + $b} }',
      'addTwo 1 2',
    ];
    const issues = collectLightweightSyntaxIssues(lines);
    const procIssues = issues.filter(i => /addTwo/.test(i.message));
    expect(procIssues).to.have.lengthOf(0);
  });

  it('reports unused proc when not invoked', () => {
    const lines = [
      'proc helper {x} { puts $x }',
      'puts "done"',
    ];
    const issues = collectLightweightSyntaxIssues(lines);
    const procIssues = issues.filter(i => /helper/.test(i.message));
    expect(procIssues.length).to.be.greaterThan(0);
  });
});
