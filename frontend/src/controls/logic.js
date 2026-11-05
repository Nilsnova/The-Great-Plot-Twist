// Device-neutral stick math. Positive y means forward; movement speed is limited by the player.
export function touchVector(dx,dy,radius=44,deadzone=0.15) {
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||radius<=0)return {x:0,y:0};
  const length=Math.hypot(dx,dy),amount=Math.min(1,length/radius);
  if(amount<=deadzone||!length)return {x:0,y:0};
  const strength=(amount-deadzone)/(1-deadzone);
  return {x:dx/length*strength,y:-dy/length*strength};
}
export function gamepadVector(axes=[]) {
  return touchVector(axes[0]||0,axes[1]||0,1,0.2);
}
export function combinedAxis(keyboard,values,key) {
  return Math.max(-1,Math.min(1,keyboard+values.reduce((sum,value)=>sum+(value[key]||0),0)));
}
export function risingButtons(current,previous=[]) {return current.map((pressed,index)=>pressed&&!previous[index]);}
