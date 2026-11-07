// The room shares the world's nine illustrated explorer poses, loaded only on entry.
const views=['explorer','explorer-back','explorer-side'];
export const captainAssets=views.flatMap(view=>[view,`${view}-walk-1`,`${view}-walk-2`]);

export function captainPose(face,phase=0,reduce=false) {
  const side=Math.abs(face.x)>Math.abs(face.y),view=side?'explorer-side':face.y<0?'explorer-back':'explorer';
  const frame=!reduce&&phase>0?[`${view}-walk-1`,view,`${view}-walk-2`,view][Math.floor(phase/(Math.PI/2))%4]:view;
  return {key:frame,view,mirror:side&&face.x<0};
}

export function createCaptainArt({onReady,imageFactory=()=>new Image()}={}) {
  const images=new Map(),pending=new Set();let started=false,disposed=false;
  return {
    load(){
      if(started||disposed)return;started=true;
      for(const key of captainAssets){
        const image=imageFactory();pending.add(image);image.decoding='async';
        const release=()=>{pending.delete(image);image.onload=null;image.onerror=null;};
        image.onload=()=>{release();if(disposed||!image.naturalWidth||!image.naturalHeight)return;images.set(key,image);onReady?.();};
        image.onerror=release;image.src=`/pixel/hd/${key}.png`;
      }
    },
    get(pose){return images.get(pose.key)??images.get(pose.view)??images.get('explorer')??null;},
    dispose(){if(disposed)return;disposed=true;for(const image of pending){image.onload=null;image.onerror=null;}pending.clear();images.clear();},
  };
}
