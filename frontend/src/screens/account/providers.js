// Sign-in providers named by /api/config auth.providers. Plain text buttons; no third-party marks.
// "email" is no button: it is the email code form (email-code.js).
export const providerLabels={github:'GitHub'};
const knownProviders=['github','email'];
export function accountProviders(account){
  const list=Array.isArray(account?.providers)?account.providers.filter(name=>knownProviders.includes(name)):[];
  return list.length?[...new Set(list)]:['github'];
}
export function signInProviders(account){
  return accountProviders(account).filter(name=>Object.hasOwn(providerLabels,name));
}
export const offersEmail=account=>accountProviders(account).includes('email');
// One button description per provider: label, intent arguments and a stable focus key.
export function providerActions(account,{prefix='Sign in with',upgrade=false,focus='account-sign-in'}={}){
  return signInProviders(account).map(name=>({provider:name,label:`${prefix} ${providerLabels[name]}`,
    args:name==='github'&&!upgrade?[]:[{provider:name,...(upgrade?{upgrade:true}:{})}],
    focus:name==='github'?focus:`${focus}-${name}`}));
}
