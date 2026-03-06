import { expect } from 'chai';

describe('Semantic token overlap detection', () => {
  it('should detect overlapping tokens', () => {
    // Simulate the token overlap detection logic
    const pendingTokens = [
      { line: 4, col: 4, length: 3, type: 'variable' },  // "set" as a whole
      { line: 4, col: 4, length: 1, type: 'dictCommand' },  // just "s"
      { line: 4, col: 5, length: 2, type: 'dictSubcommand' },  // "et"
    ];
    
    // Sort tokens by position, prefer longer tokens
    pendingTokens.sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      if (a.col !== b.col) return a.col - b.col;
      return b.length - a.length; // prefer longer tokens
    });

    const finalTokens: typeof pendingTokens = [];
    for (let i = 0; i < pendingTokens.length; i++) {
      const token = pendingTokens[i];
      const tokenEnd = token.col + token.length;
      
      // Check if this token overlaps with any previously added token on the same line
      let overlaps = false;
      for (let j = finalTokens.length - 1; j >= 0; j--) {
        const prev = finalTokens[j];
        if (prev.line !== token.line) break;
        
        const prevEnd = prev.col + prev.length;
        if (token.col < prevEnd) {
          overlaps = true;
          break;
        }
      }
      
      if (!overlaps) {
        finalTokens.push(token);
      }
    }
    
    // Should only have one token at position 4:4
    expect(finalTokens).to.have.lengthOf(1);
    expect(finalTokens[0]).to.deep.equal({ line: 4, col: 4, length: 3, type: 'variable' });
  });

  it('should handle tokens at different positions', () => {
    const pendingTokens = [
      { line: 4, col: 4, length: 3, type: 'variable' },   // "set"
      { line: 4, col: 8, length: 1, type: 'variable' },   // "s"
      { line: 4, col: 10, length: 4, type: 'string' },    // some string
    ];
    
    pendingTokens.sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      if (a.col !== b.col) return a.col - b.col;
      return b.length - a.length;
    });

    const finalTokens: typeof pendingTokens = [];
    for (let i = 0; i < pendingTokens.length; i++) {
      const token = pendingTokens[i];
      const tokenEnd = token.col + token.length;
      
      let overlaps = false;
      for (let j = finalTokens.length - 1; j >= 0; j--) {
        const prev = finalTokens[j];
        if (prev.line !== token.line) break;
        
        const prevEnd = prev.col + prev.length;
        if (token.col < prevEnd) {
          overlaps = true;
          break;
        }
      }
      
      if (!overlaps) {
        finalTokens.push(token);
      }
    }
    
    // All three should be included (no overlaps)
    expect(finalTokens).to.have.lengthOf(3);
  });
  
  it('should reject token that starts inside another token', () => {
    const pendingTokens = [
      { line: 4, col: 4, length: 3, type: 'variable' },   // "set" col 4-7
      { line: 4, col: 5, length: 5, type: 'string' },     // starts at 5, overlaps
    ];
    
    pendingTokens.sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      if (a.col !== b.col) return a.col - b.col;
      return b.length - a.length;
    });

    const finalTokens: typeof pendingTokens = [];
    for (let i = 0; i < pendingTokens.length; i++) {
      const token = pendingTokens[i];
      const tokenEnd = token.col + token.length;
      
      let overlaps = false;
      for (let j = finalTokens.length - 1; j >= 0; j--) {
        const prev = finalTokens[j];
        if (prev.line !== token.line) break;
        
        const prevEnd = prev.col + prev.length;
        if (token.col < prevEnd) {
          overlaps = true;
          break;
        }
      }
      
      if (!overlaps) {
        finalTokens.push(token);
      }
    }
    
    // Only first token should be included
    expect(finalTokens).to.have.lengthOf(1);
    expect(finalTokens[0].col).to.equal(4);
  });
});

