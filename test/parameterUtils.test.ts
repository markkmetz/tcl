import { expect } from 'chai';
import { formatParameters, formatParametersForSignature } from '../src/parameterUtils';

describe('Parameter formatting with type hints', () => {
  it('should infer string type from empty string default', () => {
    const params = ['{vara', '""}']; // {vara ""}
    const result = formatParameters(params);
    expect(result).to.equal('vara: string=""');
  });

  it('should infer float type from decimal default', () => {
    const params = ['{varb', '0.0}']; // {varb 0.0}
    const result = formatParameters(params);
    expect(result).to.equal('varb: float=0.0');
  });

  it('should infer dict/list type from empty braces', () => {
    const params = ['{varc', '{}}']; // {varc {}}
    const result = formatParameters(params);
    expect(result).to.equal('varc: dict/list={}');
  });

  it('should infer int type from integer default', () => {
    const params = ['{count', '5}']; // {count 5}
    const result = formatParameters(params);
    expect(result).to.equal('count: int=5');
  });

  it('should infer boolean type from true/false', () => {
    const params = ['{enabled', 'true}']; // {enabled true}
    const result = formatParameters(params);
    expect(result).to.equal('enabled: boolean=true');
  });

  it('should infer dict type from dict create', () => {
    const params = ['{config', '[dict', 'create', 'key', 'value]}']; // {config [dict create key value]}
    const result = formatParameters(params);
    expect(result).to.include('config: dict=');
  });

  it('should infer list type from list command', () => {
    const params = ['{items', '[list', 'a', 'b', 'c]}']; // {items [list a b c]}
    const result = formatParameters(params);
    expect(result).to.include('items: list=');
  });

  it('should handle mixed parameters with and without types', () => {
    const params = ['name', '{age', '0}', '{salary', '0.0}']; // name {age 0} {salary 0.0}
    const result = formatParameters(params);
    expect(result).to.equal('name, age: int=0, salary: float=0.0');
  });

  it('should handle quoted strings', () => {
    const params = ['{message', '"hello"}']; // {message "hello"}
    const result = formatParameters(params);
    expect(result).to.equal('message: string="hello"');
  });

  it('should infer expr type from expression', () => {
    const params = ['{calc', '[expr', '{1', '+', '2}]}']; // {calc [expr {1 + 2}]}
    const result = formatParameters(params);
    expect(result).to.include('calc: expr=');
  });

  describe('formatParametersForSignature', () => {
    it('should include type hints in signature help', () => {
      const params = ['x', '{y', '0}', '{z', '0.0}']; // x {y 0} {z 0.0}
      const result = formatParametersForSignature(params);
      
      expect(result.formatted).to.equal('x, y: int=0, z: float=0.0');
      expect(result.paramInfos).to.have.lengthOf(3);
      expect(result.paramInfos[0]).to.equal('x');
      expect(result.paramInfos[1]).to.equal('y: int (default: 0)');
      expect(result.paramInfos[2]).to.equal('z: float (default: 0.0)');
    });

    it('should handle complex defaults with type hints', () => {
      const params = ['{config', '[dict', 'create]}']; // {config [dict create]}
      const result = formatParametersForSignature(params);
      
      expect(result.formatted).to.include('config: dict=');
      expect(result.paramInfos[0]).to.include('config: dict');
    });
  });

  it('should handle negative numbers', () => {
    const params = ['{temp', '-5}', '{rate', '-2.5}']; // {temp -5} {rate -2.5}
    const result = formatParameters(params);
    expect(result).to.equal('temp: int=-5, rate: float=-2.5');
  });

  it('should handle no default (required param)', () => {
    const params = ['required', '{optional', '1}']; // required {optional 1}
    const result = formatParameters(params);
    expect(result).to.equal('required, optional: int=1');
  });
});
