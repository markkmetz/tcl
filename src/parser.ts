export interface DefinitionParseResult {
  type: 'proc' | 'method';
  name: string;
  params: string[];
}

export function parseDefinitionLine(line: string): DefinitionParseResult | null {
  const m = line.match(/^\s*(proc|method)\s+([A-Za-z0-9_:.]+)\s+\{([^}]*)\}/);
  if (!m) return null;
  const type = m[1] as 'proc' | 'method';
  const name = m[2];
  const paramsRaw = m[3] || '';
  const params = paramsRaw.split(/\s+/).filter(Boolean);
  return { type, name, params };
}
