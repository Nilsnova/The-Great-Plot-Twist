// Resolve public release identity for Vite without exposing other environment values.
function shortSha(value) {
  const sha = typeof value === 'string' ? value.trim() : '';
  return /^[a-f0-9]{7,64}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : null;
}

export function resolveBuildStamp({envSha, envName, readGitSha, readDirty, now = () => new Date()} = {}) {
  const vercelSha = shortSha(envSha);
  let sha = vercelSha;
  if (!sha) {
    try { sha = shortSha(readGitSha?.()); } catch { /* Source archives may lack Git. */ }
  }
  sha ??= 'dev';
  if (!vercelSha) {
    try { if (readDirty?.()) sha += '-dirty'; } catch { /* Keep the known identity. */ }
  }
  const environment = ['preview', 'production'].includes(envName) ? envName : null;
  return {sha, builtAt: now().toISOString(), environment};
}
