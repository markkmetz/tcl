import { expect } from 'chai';
import { formatTclText } from '../src/tclFormatterCore';

describe('Tcl formatter core', () => {
  it('ignores braces inside quoted strings', () => {
    const result = formatTclText(
      'proc test {} {\nset value "brace { inside string}"\nputs $value\n}',
      { insertSpaces: true, tabSize: 2, lineEnding: '\n' },
    );

    expect(result.error).to.be.undefined;
    expect(result.formattedText).to.equal(
      'proc test {} {\n  set value "brace { inside string}"\n  puts $value\n}',
    );
  });

  it('ignores commented code blocks', () => {
    const result = formatTclText(
      'proc test {} {\n# if {0} { puts broken }\nputs ok\n}',
      { insertSpaces: true, tabSize: 2, lineEnding: '\n' },
    );

    expect(result.error).to.be.undefined;
    expect(result.formattedText).to.equal(
      'proc test {} {\n# if {0} { puts broken }\n  puts ok\n}',
    );
  });

  it('formats nested blocks using tabs when requested', () => {
    const result = formatTclText(
      'proc test {} {\nif {1} {\nputs ok\n}\n}',
      { insertSpaces: false, tabSize: 4, lineEnding: '\n' },
    );

    expect(result.error).to.be.undefined;
    expect(result.formattedText).to.equal(
      'proc test {} {\n\tif {1} {\n\t\tputs ok\n\t}\n}',
    );
  });

  it('refuses to format invalid bracket balance', () => {
    const result = formatTclText(
      'proc test {} {\nputs ok\n}}',
      { insertSpaces: true, tabSize: 2, lineEnding: '\n' },
    );

    expect(result.error).to.exist;
    expect(result.error?.message).to.match(/Unexpected closing bracket|unclosed/);
    expect(result.error?.line).to.equal(3);
  });
});