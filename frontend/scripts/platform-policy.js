// Validate the enforced platform boundary while retaining its exact text and fallback directives.
export function readPlatformPolicy(policy, validateAddress) {
  const directives = new Map();
  for (const part of policy.split(';').map(value => value.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    if (directives.has(name)) throw new TypeError('Duplicate platform CSP directive');
    directives.set(name, values.join(' '));
  }
  const required = {
    'default-src': "'self'", 'script-src': "'self'", 'style-src': "'self'", 'img-src': "'self'",
    'object-src': "'none'", 'base-uri': "'none'", 'form-action': "'self'", 'frame-ancestors': "'none'",
  };
  const optional = {'script-src-attr': "'none'", 'style-src-attr': "'none'", 'style-src-elem': "'self'",
    'font-src': "'self'", 'media-src': "'none'", 'worker-src': "'none'", 'frame-src': "'none'"};
  for (const [key, value] of Object.entries(required)) {
    if (directives.get(key) !== value) throw new TypeError('Platform CSP differs: ' + key);
  }
  for (const [key, value] of directives) {
    if (key === 'connect-src' || Object.hasOwn(required, key)) continue;
    if (optional[key] !== value) throw new TypeError('Unsupported platform CSP directive: ' + key);
  }
  const connect = directives.get('connect-src')?.split(' ') ?? [];
  const address = validateAddress(connect.length === 1 ? '' : connect[1]);
  const expected = address ? ["'self'", address, address.replace('https://', 'wss://')] : ["'self'"];
  if (connect.join(' ') !== expected.join(' ')) throw new TypeError('Platform connections differ');
  return address;
}
