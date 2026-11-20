// Synthetic canonical session metadata for transport and controlling-tab tests.
export const actorId='11111111-1111-4111-8111-111111111111';
export const sessionId='44444444-4444-4444-8444-444444444444';
export const economy=()=>({mode:'island_shared',version:1,islandOwner:actorId,
 accountId:'22222222-2222-4222-8222-222222222222',runEpoch:'33333333-3333-4333-8333-333333333333',revision:'1',
 treasury:{balanceCoins:'100',committedCoins:'0',availableCoins:'100'}});
export const metadata=(controller=true)=>({status:'done',economy:economy(),session:{
 sessionId:controller?sessionId:null,connectionGeneration:controller?'9007199254740993':null,
 isController:controller,isSpectator:!controller,leaderId:actorId,graceUntil:null,
 place:'isle_k7q2m_0123456789abcdef01234567',topicGeneration:'2',breakPaused:false,autoNext:true,countdownSeconds:10,
}});
export const origin=()=>Object.fromEntries(['mode','version','islandOwner','accountId','runEpoch'].map(key=>[key,economy()[key]]));
export const assertion=()=>({mode:'island_shared',version:1,islandOwner:actorId,runEpoch:economy().runEpoch});
export const proof=()=>({actorId,origin:origin(),sessionId,connectionGeneration:'9007199254740993'});
export const attachRecord=()=>({actorId,origin:origin(),body:{economy:assertion(),sessionId,expectedGeneration:'0',actionUid:'attach_original_001'}});
export function controlReceipt(action,body){return {status:'done',repeat:true,economy:null,session:null,receipt:{
 receiptId:'55555555-5555-4555-8555-555555555555',actionUid:body.actionUid,action,actorId,origin:origin(),
 result:action==='session_leave'?{connectionGeneration:body.connectionGeneration}:{breakPaused:true,autoNext:false,countdownSeconds:5},
}};}
