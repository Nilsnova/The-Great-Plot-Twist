// Open Gull's Rest loads only after an authorised route reaches it.
import {createSettlement} from './settlement.js';
export function createGullsRest(ctx){return createSettlement({...ctx,placements:[
  {asset:'lens-hall-open',x:0,z:-1,collider:{x:0,z:-4,width:7,depth:5}},
  {asset:'festival-lantern-string',x:0,z:5},
]});}
