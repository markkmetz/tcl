import { expect } from 'chai';
import { extractDictSemanticTokenSpans } from '../src/semanticDictTokens';

describe('TCL Semantic Provider dict token extraction', () => {
  const extractByType = (line: string, type: 'dictCommand' | 'dictSubcommand' | 'dictKey' | 'dictValue') => {
    return extractDictSemanticTokenSpans(line)
      .filter(span => span.type === type)
      .map(span => line.slice(span.start, span.start + span.length));
  };

  it('should extract key/value tokens from inline dict create in set statement', () => {
    const line = 'set defaults [dict create retries 3 timeout 5000 verbose false]';

    const keys = extractByType(line, 'dictKey');
    const values = extractByType(line, 'dictValue');

    expect(keys).to.deep.equal(['retries', 'timeout', 'verbose']);
    expect(values).to.deep.equal(['3', '5000', 'false']);
  });

  it('should extract key/value tokens from direct dict create statement', () => {
    const line = 'dict create host localhost port 8080';

    const commands = extractByType(line, 'dictCommand');
    const subcommands = extractByType(line, 'dictSubcommand');
    const keys = extractByType(line, 'dictKey');
    const values = extractByType(line, 'dictValue');

    expect(commands).to.deep.equal(['dict']);
    expect(subcommands).to.deep.equal(['create']);
    expect(keys).to.deep.equal(['host', 'port']);
    expect(values).to.deep.equal(['localhost', '8080']);
  });

  it('should extract key/value tokens from dict set statement', () => {
    const line = 'dict set config timeout 30';

    const keys = extractByType(line, 'dictKey');
    const values = extractByType(line, 'dictValue');

    expect(keys).to.deep.equal(['timeout']);
    expect(values).to.deep.equal(['30']);
  });

  it('should extract dict command and subcommand from inline dict expression', () => {
    const line = 'set defaults [dict create retries 3 timeout 5000 verbose false]';

    const commands = extractByType(line, 'dictCommand');
    const subcommands = extractByType(line, 'dictSubcommand');

    expect(commands).to.deep.equal(['dict']);
    expect(subcommands).to.deep.equal(['create']);
  });

  it('should use same subcommand token type for other dict subcommands', () => {
    const line = 'dict get $config timeout';

    const commands = extractByType(line, 'dictCommand');
    const subcommands = extractByType(line, 'dictSubcommand');

    expect(commands).to.deep.equal(['dict']);
    expect(subcommands).to.deep.equal(['get']);
  });

  it('should extract nested dict create tokens inside set statements', () => {
    const line = 'set appConfig [dict create server [dict create host localhost port 8080] mode prod]';

    const commands = extractByType(line, 'dictCommand');
    const subcommands = extractByType(line, 'dictSubcommand');
    const keys = extractByType(line, 'dictKey');
    const values = extractByType(line, 'dictValue');

    expect(commands).to.deep.equal(['dict', 'dict']);
    expect(subcommands).to.deep.equal(['create', 'create']);
    expect(keys).to.deep.equal(['server', 'host', 'port', 'mode']);
    expect(values).to.deep.equal(['localhost', '8080', 'prod']);
  });
});
