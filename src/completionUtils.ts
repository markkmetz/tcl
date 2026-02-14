export function normalizeProcParams(params: string[] = []): string[] {
  const out: string[] = [];
  for (let i = 0; i < params.length; i++) {
    const token = params[i];
    if (token.startsWith('{')) {
      let collected = token;
      while (!collected.endsWith('}') && i + 1 < params.length) {
        i += 1;
        collected += ` ${params[i]}`;
      }
      const inner = collected.replace(/^\{/, '').replace(/\}$/, '').trim();
      if (inner) {
        const name = inner.split(/\s+/)[0];
        if (name) out.push(name);
      }
    } else if (token) {
      out.push(token);
    }
  }
  return out;
}

export function buildProcSnippet(name: string, params?: string[]): string {
  const normalized = normalizeProcParams(params || []);
  if (normalized.length) {
    const placeholders = normalized.map((param, idx) => `\${${idx + 1}:${param}}`).join(' ');
    return `${name} ${placeholders}$0`;
  }
  return `${name}$0`;
}
