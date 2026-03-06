import { expect } from 'chai';
import { extractDictSemanticTokenSpans } from '../src/semanticDictTokens';

describe('Dict semantic token extraction', () => {
  it('should not tokenize plain "set" command', () => {
    const line = '  set s "value"';
    const spans = extractDictSemanticTokenSpans(line);
    
    // Should return empty - "set" alone is not dict-related
    expect(spans).to.have.lengthOf(0, 'Plain set command should not generate dict tokens');
  });

  it('should tokenize "dict set" correctly', () => {
    const line = '  dict set mydict key value';
    const spans = extractDictSemanticTokenSpans(line);
    
    // Should have dict command and set subcommand
    expect(spans.length).to.be.greaterThan(0);
    
    // Check that dict and set are separate tokens
    const dictToken = spans.find(s => line.slice(s.start, s.start + s.length) === 'dict');
    const setToken = spans.find(s => line.slice(s.start, s.start + s.length) === 'set');
    
    expect(dictToken).to.exist;
    expect(setToken).to.exist;
    expect(dictToken!.type).to.equal('dictCommand');
    expect(setToken!.type).to.equal('dictSubcommand');
  });

  it('should not split "set" into multiple tokens', () => {
    const lines = [
      'set s "value"',
      '  set calc [expr {$x}]',
      '\tset s "{}}}}";',
    ];
    
    for (const line of lines) {
      const spans = extractDictSemanticTokenSpans(line);
      
      // Check that no span partially covers "set"
      for (const span of spans) {
        const text = line.slice(span.start, span.start + span.length);
        
        // If the span starts at "s" of "set", it should be at least 3 chars
        const charBefore = span.start > 0 ? line[span.start - 1] : ' ';
        const nextThreeChars = line.slice(span.start, span.start + 3);
        
        if (nextThreeChars === 'set' && /\s/.test(charBefore)) {
          expect(span.length).to.be.at.least(3, 
            `Token "${text}" at position ${span.start} in "${line}" should cover full "set" word`);
        }
      }
    }
  });
});
