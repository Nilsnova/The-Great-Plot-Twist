// Bounded local navigation uses the same collision facts as ordinary walking.
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function planTapPath(start,target,{canStand,step=.5,margin=5,maxNodes=3000}={}){
  if(!valid(start)||!valid(target)||typeof canStand!=='function'||!(step>0)||distance(start,target)>64||!canStand(target.x,target.y))return null;
  if(distance(start,target)<step/3)return [{...target}];
  const goal={x:Math.round((target.x-start.x)/step),y:Math.round((target.y-start.y)/step)};
  const pad=Math.ceil(margin/step),minX=Math.min(0,goal.x)-pad,maxX=Math.max(0,goal.x)+pad,minY=Math.min(0,goal.y)-pad,maxY=Math.max(0,goal.y)+pad;
  const key=(x,y)=>`${x},${y}`,point=(x,y)=>({x:start.x+x*step,y:start.y+y*step}),cache=new Map(),costs=new Map(),parents=new Map(),open=[];
  function clear(x,y){const id=key(x,y);if(!cache.has(id)){const p=point(x,y);cache.set(id,x>=minX&&x<=maxX&&y>=minY&&y<=maxY&&canStand(p.x,p.y));}return cache.get(id);}
  function push(n){open.push(n);let i=open.length-1;while(i){const p=(i-1)>>1;if(open[p].score<=n.score)break;open[i]=open[p];i=p;}open[i]=n;}
  function pop(){const first=open[0],last=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let child=i*2+1;if(child+1<open.length&&open[child+1].score<open[child].score)child++;if(open[child].score>=last.score)break;open[i]=open[child];i=child;}open[i]=last;}return first;}
  costs.set('0,0',0);push({x:0,y:0,cost:0,score:Math.hypot(goal.x,goal.y)});
  let visited=0;
  while(open.length&&visited++<maxNodes){
    const n=pop(),id=key(n.x,n.y);if(n.cost!==costs.get(id))continue;
    const p=point(n.x,n.y);
    if(distance(p,target)<=step*.8){
      let safe=true;for(let t=1;t<=4;t++)if(!canStand(p.x+(target.x-p.x)*t/4,p.y+(target.y-p.y)*t/4))safe=false;
      if(safe){const path=[{...target}];let current=id;while(current!=='0,0'){const [x,y]=current.split(',').map(Number);path.unshift(point(x,y));current=parents.get(current);}return path;}
    }
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      if(!dx&&!dy)continue;const x=n.x+dx,y=n.y+dy,next=key(x,y);
      if(!clear(x,y)||(dx&&dy&&(!clear(n.x+dx,n.y)||!clear(n.x,n.y+dy))))continue;
      const cost=n.cost+Math.hypot(dx,dy);if(cost>=(costs.get(next)??Infinity))continue;
      costs.set(next,cost);parents.set(next,id);push({x,y,cost,score:cost+Math.hypot(goal.x-x,goal.y-y)});
    }
  }
  return null;
}

export function createTapWalker({threshold=.16,stallSeconds=.7}={}){
  let path=[],previous=null,stalled=0;
  function cancel(){path=[];previous=null;stalled=0;}
  return {get active(){return path.length>0;},get target(){return path.length?{...path.at(-1)}:null;},
    follow(next){cancel();path=Array.isArray(next)?next.filter(valid).map(p=>({...p})):[];},cancel,
    direction(position,delta,{active=true,maxStep=.32,verticalFactor=1}={}){
      if(!active||!valid(position)||!Number.isFinite(delta)){cancel();return {x:0,y:0};}
      while(path.length&&distance(position,path[0])<=threshold)path.shift();
      if(!path.length){cancel();return {x:0,y:0};}
      if(previous&&distance(position,previous)<.0001)stalled+=Math.max(0,Math.min(.1,delta));else stalled=0;
      previous={...position};if(stalled>=stallSeconds){cancel();return {x:0,y:0};}
      const dx=path[0].x-position.x,dy=(path[0].y-position.y)/verticalFactor,length=Math.hypot(dx,dy),strength=Math.min(1,length/maxStep);
      return length?{x:dx/length*strength,y:dy/length*strength}:{x:0,y:0};
    }};
}
