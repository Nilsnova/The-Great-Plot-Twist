// Resolve public build identity for Vite; credentials and other environment values stay out.
function shortSha(value){
  const sha=typeof value==='string'?value.trim():'';
  return /^[a-f0-9]{7,64}$/i.test(sha)?sha.slice(0,7).toLowerCase():null;
}
export function resolveBuildStamp({envSha,readGitSha,now=()=>new Date()}={}){
  let sha=shortSha(envSha);
  if(!sha)try{sha=shortSha(readGitSha?.());}catch{/* A source archive may have no Git checkout. */}
  return {sha:sha??'dev',builtAt:now().toISOString()};
}
