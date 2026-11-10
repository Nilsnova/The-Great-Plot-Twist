// Answer helpers for the memory-only fake. Never saved, fetched or treated as server authority.
export const accept=message=>({accepted:true,reason:null,message});
export const refuse=(reason,message)=>({accepted:false,reason,message});
