// Sign-in providers named by /api/config auth.providers. Plain text buttons; no third-party marks.
export const providerLabels={github:'GitHub',google:'Google'};
export function signInProviders(account){
  const list=Array.isArray(account?.providers)?account.providers.filter(name=>Object.hasOwn(providerLabels,name)):[];
  return list.length?[...new Set(list)]:['github'];
}
// One button description per provider: label, intent arguments and a stable focus key.
export function providerActions(account,{prefix='Sign in with',upgrade=false,focus='account-sign-in'}={}){
  return signInProviders(account).map(name=>({provider:name,label:`${prefix} ${providerLabels[name]}`,
    args:name==='github'&&!upgrade?[]:[{provider:name,...(upgrade?{upgrade:true}:{})}],
    focus:name==='github'?focus:`${focus}-${name}`}));
}
