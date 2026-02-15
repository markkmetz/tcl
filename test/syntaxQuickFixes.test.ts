import { expect } from 'chai';
import { classifySyntaxError, fixInsertText, fixTitle } from '../src/syntaxQuickFixes';

describe('TCL syntax quick fixes', () => {
  it('should classify missing close brace errors', () => {
    expect(classifySyntaxError('missing close-brace')).to.equal('missing-close-brace');
    expect(classifySyntaxError('unmatched open brace in expression')).to.equal('missing-close-brace');
  });

  it('should classify missing close bracket errors', () => {
    expect(classifySyntaxError('missing close-bracket')).to.equal('missing-close-bracket');
  });

  it('should classify quote-related errors', () => {
    expect(classifySyntaxError('extra characters after close-quote')).to.equal('missing-close-quote');
    expect(classifySyntaxError('unclosed quote in line')).to.equal('missing-close-quote');
  });

  it('should return null for unsupported errors', () => {
    expect(classifySyntaxError('invalid command name "foo"')).to.equal(null);
  });

  it('should provide insert text and titles', () => {
    expect(fixInsertText('missing-close-brace')).to.equal('}');
    expect(fixInsertText('missing-close-bracket')).to.equal(']');
    expect(fixInsertText('missing-close-quote')).to.equal('"');

    expect(fixTitle('missing-close-brace')).to.contain('brace');
    expect(fixTitle('missing-close-bracket')).to.contain('bracket');
    expect(fixTitle('missing-close-quote')).to.contain('quote');
  });
});
