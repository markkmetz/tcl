import { expect } from 'chai';
import { BUILTINS, SNIPPETS } from '../src/builtins';

describe('Builtins and snippets', () => {
  it('does not include control-flow builtins like if or try', () => {
    expect(BUILTINS).to.not.have.property('if');
    expect(BUILTINS).to.not.have.property('try');
  });

  it('includes simple variable-taking builtins like set and puts', () => {
    expect(BUILTINS).to.have.property('set');
    expect(BUILTINS).to.have.property('puts');
    expect(BUILTINS['set'].params[0]).to.equal('varName');
  });

  it('exports snippets for proc and namespace', () => {
    expect(SNIPPETS).to.have.property('proc');
    expect(SNIPPETS).to.have.property('namespace');
    expect(SNIPPETS['proc'].snippet).to.match(/proc \$\{1:name\}/);
  });
});
