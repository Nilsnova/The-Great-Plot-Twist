// Synthetic original reset receipt, separate from authoritative replacement-context reads.
import {actorId,origin} from './shared-session-fixture.js';
export function resetReply(body){return {status:'done',repeat:true,currentEconomy:null,receipt:{receiptId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actorId,actionUid:body.actionUid,action:'reset',origin:origin(),
 result:{newAccountId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',newRunEpoch:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',retiredTreasury:{balanceCoins:'100',committedCoins:'1',availableCoins:'99',revision:'2'},startingCoins:'200',
  grantReceiptId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',grantPolicyVersion:'catalogue-starting-coins-v1',
  effects:{buildingsCleared:1,researchCleared:1,layoutCleared:1,healthCleared:1,wallRecordsCleared:1,copiesCleared:1,historicalMovesRetained:1,controlsRevoked:1,wavesClosed:0}}}};}
