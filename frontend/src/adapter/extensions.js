// Disconnected view parts. No account data or presence is invented here.
export function emptyExtensions(){
  return {
    presence:{status:'off',place:null,others:[],hiddenCount:0,crew:[],sampledAt:0,localEmote:null,canEmote:false,cooldown:0,emotes:[]},
    account:{state:'signed_out',captainName:null,canSignIn:false,canReroll:false,guest:false,providers:['github'],
      connection:{state:'idle',message:'',reason:null}},
  };
}
