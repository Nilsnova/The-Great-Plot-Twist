// Host-page PKCE: one-time verifier in this tab; exchanged login token stays in session memory.
import { makeVerifier, makeChallenge } from '../../public/auth-check-pkce.js';
import { loadSignInConfig, exchangeCodeForToken } from '../../public/auth-check-api.js';
const KEY='host-console-pkce';
export function takeCallback(location,history) {
  const query=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));
  if(location.search||location.hash)history.replaceState(null,'',location.pathname);
  return {code:query.get('code'),failed:query.has('error')||fragment.has('error')};
}
export async function finishHostLogin(callback,session,storage=sessionStorage) {
  if(!callback.code || callback.failed)return false;
  const verifier=storage.getItem(KEY);storage.removeItem(KEY);
  if(!verifier)return false;
  const answer=await exchangeCodeForToken(callback.code,verifier);
  if(answer.status!==200 || typeof answer.body?.accessToken!=='string')return false;
  session.setToken(answer.body.accessToken);return true;
}
export async function startHostLogin() {
  const config=await loadSignInConfig();
  if(!config || config.provider!=='github')throw new Error('Sign-in unavailable');
  const url=new URL(config.supabaseUrl);
  if(url.protocol!=='https:' || url.username || url.password)throw new Error('Sign-in unavailable');
  const verifier=makeVerifier(),challenge=await makeChallenge(verifier);
  sessionStorage.setItem(KEY,verifier);
  const query=new URLSearchParams({provider:'github',redirect_to:`${location.origin}/host.html`,
    code_challenge:challenge,code_challenge_method:'s256'});
  location.assign(`${url.origin}/auth/v1/authorize?${query}`);
}
