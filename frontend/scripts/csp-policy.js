// Proposed production policy, rehearsed by Vite preview. Claude owns deployed headers.
export const proposedCsp=[
  "default-src 'self'", "script-src 'self'", "script-src-attr 'none'",
  "style-src 'self'", "style-src-elem 'self'", "style-src-attr 'none'",
  "img-src 'self'", "font-src 'self'",
  "connect-src 'self' https://uqcjihigqjgyuafrfbnp.supabase.co wss://uqcjihigqjgyuafrfbnp.supabase.co",
  "media-src 'none'", "worker-src 'none'", "frame-src 'none'", "object-src 'none'",
  "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
