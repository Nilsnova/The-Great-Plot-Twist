// Display geometry only. Hit/lock decisions belong to the adapter.
export const normaliseDegrees=value=>((value%360)+360)%360;
export const angularDistance=(a,b)=>Math.abs(((a-b+540)%360)-180);
export function bearingBetween(origin,target){return normaliseDegrees(Math.atan2(target.x-origin.x,origin.y-target.y)*180/Math.PI);}
export function pointerBearing(rect,clientX,clientY){return bearingBetween({x:rect.left+rect.width/2,y:rect.top+rect.height/2},{x:clientX,y:clientY});}
