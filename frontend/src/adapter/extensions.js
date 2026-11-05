// Disconnected G7 view parts. No account data, reward or presence is invented here.
export function emptyExtensions(){
  return {
    presence:{status:'off',place:null,others:[],hiddenCount:0,crew:[],sampledAt:0},
    account:{state:'signed_out',captainName:null,canReroll:false,hasKit:false,canContinue:false,save:{state:'idle',label:'Local intro only',updatedAt:null}},
    rewards:{balance:null,recent:[],ledger:[],keepsakes:[],epilogue:[],wallEntry:null,festivalBadge:false,contributors:[]},
    log:{intro:null,cards:[],deductions:[],partnerReports:[],nights:[],reveal:[]},
    hints:{items:[],actions:[]},
    continuation:null,
  };
}
