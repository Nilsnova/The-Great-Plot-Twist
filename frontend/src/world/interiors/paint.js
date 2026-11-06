// Cached original room scenery plus a smooth explorer and restrained ambient light.
import {paintFurniture} from './furniture.js';
import {captainPose} from './captain-art.js';

function windowLight(c,x,y,w,h,dusk=false) {
  const light=c.createLinearGradient(x,y,x,y+h);light.addColorStop(0,dusk?'#89b3b0':'#9ac3b9');light.addColorStop(1,'#537b7d');
  c.fillStyle='#253e46';c.fillRect(x-5,y-5,w+10,h+10);c.fillStyle=light;c.fillRect(x,y,w,h);
  c.fillStyle='#d0bd8a';c.fillRect(x+w*.47,y,w*.06,h);c.fillRect(x,y+h*.48,w,h*.06);
  c.fillStyle='#e2cea0';c.fillRect(x-8,y+h+2,w+16,5);
  c.fillStyle='#d7dcac16';c.beginPath();c.moveTo(x,y+h);c.lineTo(x+w,y+h);c.lineTo(x+w*1.8,y+h*3.7);c.lineTo(x-w*.4,y+h*3.7);c.fill();
}
function planks(c,w,h,stone) {
  c.fillStyle=stone?'#6e7771':'#6e5140';c.fillRect(0,h*.27,w,h*.73);
  const row=Math.max(12,w/38);
  for(let y=h*.28,n=0;y<h;y+=row,n++){
    c.fillStyle=(n%2===0)?(stone?'#778078':'#805e47'):(stone?'#68766f':'#74543f');c.fillRect(0,y,w,row-1);
    c.fillStyle='#171c1b44';c.fillRect(0,y+row-1,w,1);
    const length=Math.max(80,w/5),offset=(n%3)*length/3;
    for(let x=-length+offset;x<w;x+=length){c.fillRect(x,y,1,row);c.fillStyle='#c4a37244';c.fillRect(x+3,y+3,2,2);c.fillRect(x+3,y+row-5,2,2);c.fillStyle='#171c1b44';}
    if(!stone){c.strokeStyle='#b8956b20';c.lineWidth=1;for(let k=0;k<6;k++){c.beginPath();c.moveTo(0,y+3+k*row/7);c.bezierCurveTo(w*.23,y+2+k*row/7,w*.64,y+7+k*row/7,w,y+3+k*row/7);c.stroke();}}
  }
}
function walls(c,w,h,stone) {
  const gradient=c.createLinearGradient(0,0,0,h*.3);gradient.addColorStop(0,stone?'#536b6e':'#4d4d42');gradient.addColorStop(1,stone?'#8a9690':'#a29474');
  c.fillStyle=gradient;c.fillRect(0,0,w,h*.29);
  if(stone){
    c.strokeStyle='#3f585d88';c.lineWidth=2;
    for(let y=0,n=0;y<h*.29;y+=25,n++)for(let x=(n%2)*45-90;x<w;x+=90)c.strokeRect(x,y,90,25);
  }else{
    c.strokeStyle='#4e433c55';c.lineWidth=2;for(let x=0;x<w;x+=w/15){c.beginPath();c.moveTo(x,0);c.lineTo(x,h*.28);c.stroke();}
  }
  c.fillStyle='#262e2f';c.fillRect(0,h*.275,w,h*.025);c.fillStyle='#cfaa70';c.fillRect(0,h*.275,w,3);
  for(const side of [0,w*.95]){c.fillStyle='#1a2d34';c.fillRect(side,0,w*.05,h);c.fillStyle='#725c44';c.fillRect(side+w*.012,0,w*.017,h);}
  c.fillStyle='#342e29';c.fillRect(0,h*.025,w,h*.025);c.fillStyle='#bd9662';c.fillRect(0,h*.025,w,3);
}
function rugs(c,w,h,stone) {
  if(stone){
    c.strokeStyle='#bcb99a44';c.lineWidth=2;c.beginPath();c.ellipse(w*.51,h*.62,w*.29,h*.28,0,0,Math.PI*2);c.stroke();return;
  }
  c.fillStyle='#173d4355';c.fillRect(w*.36,h*.57,w*.3,h*.24);c.fillStyle='#557778';c.fillRect(w*.35,h*.56,w*.3,h*.24);
  c.strokeStyle='#c7b78b';c.lineWidth=3;c.strokeRect(w*.36,h*.57,w*.28,h*.22);
  c.strokeStyle='#acaa8588';c.lineWidth=1;for(let k=0;k<15;k++){const y=h*(.58+k*.014);c.beginPath();c.moveTo(w*.365,y);c.lineTo(w*.635,y);c.stroke();}
}
function details(c,w,h,room) {
  c.fillStyle='#263b43';c.fillRect(w*.47,h*.885,w*.06,h*.12);c.fillStyle='#bd9866';c.fillRect(w*.47,h*.885,w*.06,4);
  c.fillStyle='#ddc188';c.fillRect(w*.478,h*.889,w*.044,2);
  if(room.palette==='boathouse'){
    c.strokeStyle='#b1a17b88';c.lineWidth=1;
    for(let i=0;i<8;i++){c.beginPath();c.moveTo(w*.13+i*w*.018,h*.075);c.lineTo(w*.13+i*w*.018,h*.26);c.stroke();}
    for(let i=0;i<7;i++){c.beginPath();c.moveTo(w*.13,h*(.08+i*.025));c.lineTo(w*.26,h*(.08+i*.025));c.stroke();}
    c.strokeStyle='#bda575';c.lineWidth=3;for(let i=0;i<3;i++){c.beginPath();c.ellipse(w*.58,h*.69,w*(.03+i*.007),h*(.018+i*.004),-.35,0,Math.PI*2);c.stroke();}
  }else if(room.palette==='cottage'){
    const px=w*.47,py=h*.4,pot=Math.min(w*.04,h*.055);
    c.strokeStyle='#567259';c.lineWidth=2;
    for(let i=0;i<7;i++){
      const side=i%2===0?1:-1,tip=px+side*pot*(.45+(i%3)*.25),top=py-pot*(.8+(i%4)*.22);
      c.beginPath();c.moveTo(px,py);c.quadraticCurveTo(px+side*pot*.25,top,tip,top);c.stroke();
      c.fillStyle=i%2===0?'#66865b':'#385e44';c.beginPath();c.ellipse(tip,top,pot*.35,pot*.12,side*.5,0,Math.PI*2);c.fill();
    }
    c.fillStyle='#b68860';c.beginPath();c.moveTo(px-pot*.45,py);c.lineTo(px+pot*.45,py);c.lineTo(px+pot*.3,py+pot*.55);c.lineTo(px-pot*.3,py+pot*.55);c.fill();
    c.fillStyle='#d0a276';c.fillRect(px-pot*.48,py-pot*.06,pot*.96,pot*.12);
    c.fillStyle='#cec8a1';c.fillRect(w*.43,h*.1,w*.12,h*.12);c.fillStyle='#6f8980';c.fillRect(w*.44,h*.11,w*.1,h*.1);
    c.fillStyle='#b3c0a1';c.beginPath();c.moveTo(w*.45,h*.19);c.lineTo(w*.5,h*.13);c.lineTo(w*.53,h*.19);c.fill();
  }
}
export function paintRoom(c,width,height,room) {
  c.clearRect(0,0,width,height);c.fillStyle='#14272f';c.fillRect(0,0,width,height);
  const stone=room.palette==='lighthouse';planks(c,width,height,stone);walls(c,width,height,stone);
  windowLight(c,width*.12,height*.075,width*.15,height*.16,stone);
  windowLight(c,width*.72,height*.075,width*.14,height*.16,stone);
  rugs(c,width,height,stone);details(c,width,height,room);
  for(const object of room.objects)paintFurniture(c,object,width,height);
  const shade=c.createRadialGradient(width*.5,height*.54,width*.08,width*.5,height*.52,width*.71);
  shade.addColorStop(0,'#071b2700');shade.addColorStop(.73,'#071b2722');shade.addColorStop(1,'#071b27aa');c.fillStyle=shade;c.fillRect(0,0,width,height);
}

export function paintCaptain(c,width,height,position,phase,face,reduce=false,art=null) {
  const size=Math.max(34,Math.min(64,width*.048)),x=position.x*width,y=position.y*height,bob=reduce?0:Math.sin(phase)*size*.025;
  c.save();c.translate(x,y+bob);c.fillStyle='#10252b77';c.beginPath();c.ellipse(0,size*.12,size*.32,size*.13,0,0,Math.PI*2);c.fill();
  const pose=captainPose(face,phase,reduce),image=art?.get(pose);
  if(image){
    const imageHeight=size*1.2,imageWidth=imageHeight*image.naturalWidth/image.naturalHeight;
    if(pose.mirror)c.scale(-1,1);c.imageSmoothingEnabled=true;c.drawImage(image,-imageWidth/2,-size,imageWidth,imageHeight);c.restore();return;
  }
  const step=reduce?0:Math.sin(phase)*size*.035;c.fillStyle='#263d3f';c.fillRect(-size*.2,-size*.04,size*.15,size*.24+step);c.fillRect(size*.05,-size*.04,size*.15,size*.24-step);
  c.fillStyle='#344c43';c.fillRect(-size*.32,-size*.53,size*.64,size*.5);c.fillStyle='#81966a';c.fillRect(-size*.25,-size*.55,size*.5,size*.44);
  c.fillStyle='#c5b47c';c.fillRect(-size*.15,-size*.36,size*.3,size*.19);c.fillStyle='#506a52';c.fillRect(-size*.11,-size*.32,size*.22,size*.1);
  c.fillStyle='#cbb58b';c.fillRect(-size*.17,-size*.81,size*.34,size*.26);
  c.fillStyle='#213a3d';c.fillRect(-size*.24,-size*.99,size*.48,size*.18);c.fillRect(-size*.34,-size*.82,size*.68,size*.09);
  c.fillStyle='#8b9e6b';c.fillRect(-size*.2,-size*.96,size*.4,size*.13);
  if(face.y>0){c.fillStyle='#20383b';c.fillRect(-size*.08,-size*.7,size*.035,size*.035);c.fillRect(size*.065,-size*.7,size*.035,size*.035);}
  c.restore();
}

export function paintAtmosphere(c,width,height,room,time,reduce=false) {
  const pulse=reduce?1:.96+Math.sin(time*1.7)*.04,hotspot=room.hotspots[0];
  const x=hotspot.x*width,y=(hotspot.y-.06)*height,r=Math.min(width,height)*.23;
  const glow=c.createRadialGradient(x,y,0,x,y,r);glow.addColorStop(0,`rgba(255,211,130,${.12*pulse})`);glow.addColorStop(1,'#ffd38200');c.fillStyle=glow;c.fillRect(0,0,width,height);
  if(reduce)return;c.fillStyle='#f2e2b14d';
  for(let i=0;i<9;i++){const px=width*(.15+(i*.137+time*.006)% .7),py=height*(.3+(i*.117-time*.004+10)% .53);c.fillRect(px,py,1.5,1.5);}
}
