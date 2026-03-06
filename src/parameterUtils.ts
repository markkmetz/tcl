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
      if (defaultValue.includes(' ') || defaultValue.includes('{') || defaultValue.includes('[')) {
        formatted.push(`${paramName}={${defaultValue}}`);
      } else {
        formatted.push(`${paramName}=${defaultValue}`);
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
      if (defaultValue.includes(' ') || defaultValue.includes('{') || defaultValue.includes('[')) {
        formatted.push(`${paramName}={${defaultValue}}`);
        paramInfos.push(`${paramName} (default: {${defaultValue}})`);
      } else {
        formatted.push(`${paramName}=${defaultValue}`);
        paramInfos.push(`${paramName} (default: ${defaultValue})`);
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
