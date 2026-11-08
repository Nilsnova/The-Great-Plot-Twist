// The one place the duel screen calls fetch. It adds the Bearer token, sends and reads JSON, and
// turns every outcome into plain data: it never throws. Requests go out one at a time (the next
// waits for the one before), and nothing is sent to a route that needs a sign-in when there is
// no token. It knows nothing about duels. The token is passed in by the game later (package A2);
// it is never stored, logged or put in an address.
// Used by: http-adapter.js.

const REQUEST_TIMEOUT_MS = 10 * 1000; // a call that takes longer is cancelled
const MAX_RETRY_AFTER_MS = 5 * 60 * 1000;

// The address of one duel. The id comes from the server, but is encoded anyway.
export const duelPath = id => `/api/duels/${encodeURIComponent(id)}`;

// Retry-After is a number of seconds. Anything else counts as "no hint".
export function parseRetryAfter(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : 0;
}

const answerOf = (fields) => ({ ok: false, status: 0, code: null, data: null, retryAfterMs: 0, network: false, ...fields });

export function createClient({ fetchImpl, getToken, request, getIdentity, canUse = () => true }) {
  let queue = Promise.resolve();
  let generation = 0, disposed = false;
  const identity = () => { try { return getIdentity ? getIdentity() : getToken?.(); } catch { return null; } };
  const unavailable = () => answerOf({ status: 401, code: 'unauthorized', stale: true });
  const enabled=()=>{try{return canUse()===true;}catch{return false;}};

  async function readToken() {
    try { return (await getToken?.()) || null; } catch { return null; }
  }

  async function once(method, path, { body, auth, scope, epoch }) {
    if(disposed||epoch!==generation||(auth&&scope!==identity()))return unavailable();
    if(auth&&getIdentity&&scope===null)return answerOf({status:401,code:'unauthorized'});
    if(auth&&!enabled())return answerOf({status:404,code:'feature_off'});
    const headers = { Accept: 'application/json' };
    if (auth) {
      const token = await readToken();
      if (!token) return answerOf({ status: 401, code: 'unauthorized' }); // nothing is sent without a token
      headers.Authorization = `Bearer ${token}`;
    }
    if(disposed||epoch!==generation||(auth&&scope!==identity()))return unavailable();
    if(auth&&!enabled())return answerOf({status:404,code:'feature_off'});
    if(request){
      let answer;
      try{answer=await (!auth?request.publicGet(path):method==='GET'?request.get(path):request.post(path,body));}
      catch{return answerOf({network:true});}
      if(disposed||epoch!==generation||(auth&&scope!==identity()))return unavailable();
      return answerOf({ok:answer?.ok===true,status:answer?.status??0,data:answer?.data??null,
        code:answer?.code??null,retryAfterMs:Math.min(MAX_RETRY_AFTER_MS,Math.max(0,answer?.retryAfterSeconds??0)*1000),
        network:answer?.status===0});
    }
    const options = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    if (typeof AbortSignal?.timeout === 'function') options.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    let response;
    try { response = await fetchImpl(path, options); } catch { return answerOf({ network: true }); }
    let data = null;
    try { data = await response.json(); } catch { /* an answer that is not JSON is judged by its status alone */ }
    if(disposed||epoch!==generation||(auth&&scope!==identity()))return unavailable();
    return answerOf({
      ok: response.ok, status: response.status, data, code: data?.error?.code ?? null,
      retryAfterMs: parseRetryAfter(response.headers?.get?.('Retry-After')),
    });
  }

  // send('GET', '/api/duels') or send('POST', path, { body }). `auth: false` is for /api/config.
  function send(method, path, { body, auth = true } = {}) {
    const scope=identity(),epoch=generation,snapshot=body===undefined?undefined:structuredClone(body);
    const result = queue.then(() => once(method, path, { body:snapshot, auth, scope, epoch }));
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  return { send, invalidate(){generation++;},dispose(){disposed=true;generation++;} };
}
