function inferTypeFromDefault(defaultValue: string): string | null {
  if (!defaultValue) return null;
  
  const trimmed = defaultValue.trim();
  
  // Empty string "" → string
  if (trimmed === '""' || trimmed === "''") return 'string';
  
  // String with quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return 'string';
  }
  
  // Empty braces {} → dict/list
  if (trimmed === '{}') return 'dict/list';
  
  // Dict create pattern
  if (trimmed.includes('dict') && (trimmed.includes('create') || trimmed.includes('set'))) {
    return 'dict';
  }
  
  // List pattern
  if (trimmed.startsWith('[list') || trimmed.startsWith('list')) {
    return 'list';
  }
  
  // Array pattern
  if (trimmed.startsWith('[array')) {
    return 'array';
  }
  
  // Boolean-like values
  if (/^(true|false|yes|no|on|off)$/i.test(trimmed)) {
    return 'boolean';
  }
  
  // Float pattern (contains decimal point)
  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return 'float';
  }
  
  // Integer pattern
  if (/^-?\d+$/.test(trimmed)) {
    return 'int';
  }
  
  // Expression [expr ...]
  if (trimmed.startsWith('[expr')) {
    return 'expr';
  }
  
  return null;
}

export function formatParameters(params: string[]): string {
  if (!params || params.length === 0) return '(no params)';
  
  const formatted: string[] = [];
  let i = 0;
  
  while (i < params.length) {
    const param = params[i];
    
    // Check if this starts a default parameter group: {paramName
    if (param.startsWith('{')) {
      const paramName = param.slice(1); // remove leading {
      i++;
      
      // Collect default value tokens until we find the closing }
      const defaultParts: string[] = [];
      while (i < params.length && !params[i].endsWith('}')) {
        defaultParts.push(params[i]);
        i++;
      }
      
      // Add the closing token (if it exists)
      if (i < params.length) {
        const lastPart = params[i];
        if (lastPart.endsWith('}')) {
          defaultParts.push(lastPart.slice(0, -1)); // remove trailing }
        }
        i++;
      }
      
      // Format as paramName=defaultValue or paramName={complex default}
      const defaultValue = defaultParts.join(' ');
      const inferredType = inferTypeFromDefault(defaultValue);
      const typeHint = inferredType ? `: ${inferredType}` : '';
      
      // Special case: don't wrap empty braces or simple values
      const needsWrapping = defaultValue !== '{}' && 
                           (defaultValue.includes(' ') || 
                            (defaultValue.includes('{') && !defaultValue.match(/^[\{\}]+$/)) || 
                            defaultValue.includes('['));
      
      if (needsWrapping) {
        formatted.push(`${paramName}${typeHint}={${defaultValue}}`);
      } else {
        formatted.push(`${paramName}${typeHint}=${defaultValue}`);
      }
    } else {
      // Simple parameter without default
      formatted.push(param);
      i++;
    }
  }
  
  return formatted.join(', ');
}

export function formatParametersForSignature(params: string[]): { formatted: string; paramInfos: string[] } {
  if (!params || params.length === 0) {
    return { formatted: '', paramInfos: [] };
  }
  
  const formatted: string[] = [];
  const paramInfos: string[] = [];
  let i = 0;
  
  while (i < params.length) {
    const param = params[i];
    
    // Check if this starts a default parameter group: {paramName
    if (param.startsWith('{')) {
      const paramName = param.slice(1); // remove leading {
      i++;
      
      // Collect default value tokens until we find the closing }
      const defaultParts: string[] = [];
      while (i < params.length && !params[i].endsWith('}')) {
        defaultParts.push(params[i]);
        i++;
      }
      
      // Add the closing token (if it exists)
      if (i < params.length) {
        const lastPart = params[i];
        if (lastPart.endsWith('}')) {
          defaultParts.push(lastPart.slice(0, -1)); // remove trailing }
        }
        i++;
      }
      
      // Format as paramName=defaultValue or paramName={complex default}
      const defaultValue = defaultParts.join(' ');
      const inferredType = inferTypeFromDefault(defaultValue);
      const typeHint = inferredType ? `: ${inferredType}` : '';
      
      // Special case: don't wrap empty braces or simple values
      const needsWrapping = defaultValue !== '{}' && 
                           (defaultValue.includes(' ') || 
                            (defaultValue.includes('{') && !defaultValue.match(/^[\{\}]+$/)) || 
                            defaultValue.includes('['));
      
      if (needsWrapping) {
        formatted.push(`${paramName}${typeHint}={${defaultValue}}`);
        paramInfos.push(`${paramName}${typeHint} (default: {${defaultValue}})`);
      } else {
        formatted.push(`${paramName}${typeHint}=${defaultValue}`);
        paramInfos.push(`${paramName}${typeHint} (default: ${defaultValue})`);
      }
    } else {
      // Simple parameter without default
      formatted.push(param);
      paramInfos.push(param);
      i++;
    }
  }
  
  return { formatted: formatted.join(', '), paramInfos };
}
