import { expect } from 'chai';
import { getSuppressionOptionsForSeverityNumber } from '../src/syntaxQuickFixes';

describe('Syntax code action suppression options', () => {
  it('returns warning + all options for warning diagnostics', () => {
    const options = getSuppressionOptionsForSeverityNumber(1);
    const keys = options.map(o => o.key);

    expect(keys).to.deep.equal(['warning', 'all']);
    expect(options[0].lineTitle).to.equal('Suppress this warning (line)');
    expect(options[0].fileTitle).to.equal('Suppress all warnings in file');
  });

  it('returns error + all options for error diagnostics', () => {
    const options = getSuppressionOptionsForSeverityNumber(0);
    const keys = options.map(o => o.key);

    expect(keys).to.deep.equal(['error', 'all']);
    expect(options[0].lineTitle).to.equal('Suppress this error (line)');
    expect(options[0].fileTitle).to.equal('Suppress all errors in file');
  });

  it('treats undefined severity as error + all', () => {
    const options = getSuppressionOptionsForSeverityNumber(undefined);
    expect(options.map(o => o.key)).to.deep.equal(['error', 'all']);
  });
});
