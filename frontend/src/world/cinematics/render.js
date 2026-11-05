// Native 448×256 pixel staging. The registered local light origins project to chart markers.
const W=448,H=256;
function sea(draw,time,wind) {
  draw.fillStyle='#32665f';draw.fillRect(0,0,W,H);
  draw.fillStyle='#284f43';draw.fillRect(0,34,68,14);draw.fillRect(0,24,41,12);draw.fillRect(384,28,64,20);draw.fillRect(411,18,37,12);
  for(let row=0;row<12;row++) for(let col=0;col<15;col++) {
    const x=((col*33+row*13-Math.round(time*(3+wind*9)))%480+480)%480-16;
    draw.fillStyle=row%2?'#467e6c':'#548a77';draw.fillRect(x,62+row*16,8,1);
  }
}
function fog(draw,image,amount,time) {
  draw.globalAlpha=Math.max(0,amount)*.65;draw.fillStyle='#92ac94';draw.fillRect(0,0,W,H);
  if(image)for(let i=0;i<5;i++)draw.drawImage(image,Math.round((i*101+Math.sin(time*.4+i)*6)-25),40+i%2*70);
  draw.globalAlpha=1;
}
function marker(draw,x,y,bright=1) {
  draw.globalAlpha=bright;draw.fillStyle='#d1b778';draw.fillRect(x-3,y-1,7,3);draw.fillRect(x-1,y-3,3,7);
  draw.fillStyle='#f5dda0';draw.fillRect(x-1,y-1,3,3);draw.globalAlpha=1;
}
function beam(draw,light,target,progress,index) {
  const goal=Math.atan2(target.y-light.y,target.x-light.x),turn=Math.min(1,progress/.7);
  const angle=goal+(1-turn)*(index%2?-.8:.8),length=Math.hypot(target.x-light.x,target.y-light.y);
  const x=light.x+Math.cos(angle)*length,y=light.y+Math.sin(angle)*length,sideX=-Math.sin(angle)*5,sideY=Math.cos(angle)*5;
  draw.fillStyle='#f1d393';draw.globalAlpha=.22;draw.beginPath();draw.moveTo(light.x,light.y);draw.lineTo(Math.round(x+sideX),Math.round(y+sideY));draw.lineTo(Math.round(x-sideX),Math.round(y-sideY));draw.closePath();draw.fill();
  draw.globalAlpha=.8;draw.strokeStyle='#e6cd8c';draw.lineWidth=1;draw.beginPath();draw.moveTo(light.x,light.y);draw.lineTo(Math.round(x),Math.round(y));draw.stroke();draw.globalAlpha=1;marker(draw,light.x,light.y);
}
export function drawShot(draw,shot) {
  const {name,images,p,lights,target,time,wind,revealAsset}=shot;draw.imageSmoothingEnabled=false;draw.globalAlpha=1;
  if(name==='three_lights'||name==='relighting') {
    draw.drawImage(images.chart,0,0);
    if(name==='relighting'){draw.globalAlpha=p;draw.drawImage(images['chart-relit'],0,0);draw.globalAlpha=1;lights.forEach((light,i)=>marker(draw,light.x,light.y,Math.min(1,p*2-i*.15)));}
    else {lights.forEach((light,i)=>beam(draw,light,target,p,i));if(p>.7)marker(draw,target.x,target.y);}
    return;
  }
  sea(draw,time,wind);
  if(name==='fog_lift'){draw.drawImage(images['false-light'],176,77);fog(draw,images['fog-bank'],1-p,time);}
  if(name==='schooner_reveal') {
    draw.globalAlpha=Math.round(p*8)/8;draw.drawImage(images['ghost-schooner'],160,83);draw.globalAlpha=1;fog(draw,images['fog-bank'],.65*(1-p),time);
  }
  if(name==='unmask') {
    const reveal=p>.55&&revealAsset;
    draw.drawImage(images[reveal?revealAsset:'character-masked-captain'],176,50,96,128);
    if(p>.55&&!reveal){draw.fillStyle='#263c32';draw.fillRect(208,82,36,28);draw.fillStyle='#728270';draw.fillRect(221,114+Math.round((p-.55)*50),24,12);}
    fog(draw,images['fog-bank'],.25*(1-p),time);
  }
}
