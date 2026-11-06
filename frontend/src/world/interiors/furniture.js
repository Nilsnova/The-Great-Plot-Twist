// Original high-resolution room props, drawn locally once per room/resize.
function box(c, x, y, w, h, color) { c.fillStyle = color; c.fillRect(x, y, w, h); }
function line(c, color, width, ...points) {
  c.strokeStyle = color; c.lineWidth = width; c.beginPath();
  points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.stroke();
}
function wooden(c, x, y, w, h) {
  box(c,x+5,y+10,w,h,'#101b2088'); box(c,x,y,w,h,'#4a332a');
  box(c,x+3,y+3,w-6,h-10,'#9e7350'); box(c,x+7,y+7,w-14,h-18,'#73503b');
  for(let i=1;i<6;i++)line(c,'#b58b5b55',1,[x+8,y+h*i/6],[x+w-8,y+h*i/6]);
}
function lamp(c, x, y, size) {
  box(c,x-size*.22,y-size*.55,size*.44,size*.65,'#e7b760');
  box(c,x-size*.12,y-size*.5,size*.24,size*.5,'#ffe6a4');
  line(c,'#36413c',Math.max(2,size*.08),[x-size*.28,y-size*.6],[x+size*.28,y-size*.6],[x+size*.3,y+size*.12],[x-size*.3,y+size*.12],[x-size*.28,y-size*.6]);
  line(c,'#d8b46e',2,[x-size*.12,y-size*.62],[x-size*.12,y-size*.85],[x+size*.12,y-size*.85],[x+size*.12,y-size*.62]);
}
function shelf(c,x,y,w,h) {
  wooden(c,x,y,w,h);
  const colors=['#b8584b','#d4b969','#738c87','#c28b5c','#667356','#c6b28b'];
  for(let row=0;row<2;row++)for(let i=0;i<11;i++){
    const bw=(w-22)/13,bh=h*(.24+(i%3)*.025),bx=x+12+i*(w-24)/11,by=y+10+row*h*.42;
    box(c,bx,by,bw,bh,colors[(i+row*2)%colors.length]);
    box(c,bx+2,by+4,Math.max(1,bw-4),2,'#eddbad88');
  }
}
function desk(c,x,y,w,h) {
  wooden(c,x,y,w,h); box(c,x+w*.12,y+h*.8,w*.12,h*.17,'#382c26');
  box(c,x+w*.76,y+h*.8,w*.12,h*.17,'#382c26');
  c.save();c.translate(x+w*.5,y+h*.37);c.rotate(-.08);
  box(c,-w*.2,-h*.21,w*.36,h*.41,'#e7d7ad');
  for(let i=0;i<5;i++)box(c,-w*.16,-h*.13+i*h*.055,w*(.22-(i%2)*.035),1.5,'#80775d');c.restore();
  box(c,x+w*.73,y+h*.25,w*.09,h*.12,'#2f4143');
  line(c,'#d9c8a1',2,[x+w*.77,y+h*.26],[x+w*.86,y+h*.1]);
  c.fillStyle='#e5d6af';c.beginPath();c.ellipse(x+w*.25,y+h*.55,w*.055,h*.11,0,0,Math.PI*2);c.fill();
  c.strokeStyle='#836a48';c.lineWidth=2;c.stroke(); lamp(c,x+w*.13,y+h*.16,Math.min(w,h)*.32);
}
function bed(c,x,y,w,h) {
  wooden(c,x,y,w,h);box(c,x+7,y+8,w-14,h-24,'#9fafa5');
  box(c,x+11,y+12,w-22,h*.23,'#e4ddc5'); box(c,x+8,y+h*.36,w-16,h*.5,'#5f8580');
  for(let i=0;i<7;i++)line(c,'#abc0a655',1,[x+12+i*w*.1,y+h*.38],[x+12+i*w*.1,y+h*.83]);
  line(c,'#ddd3ac',3,[x+10,y+h*.41],[x+w-10,y+h*.41]);
}
function stove(c,x,y,w,h) {
  box(c,x+6,y+8,w,h,'#10222966');box(c,x+w*.34,y-h*.5,w*.32,h*.65,'#35434a');
  box(c,x,y,w,h*.85,'#2a373d');box(c,x+5,y+5,w-10,h*.6,'#3e5156');
  box(c,x+w*.2,y+h*.25,w*.6,h*.28,'#b37043');box(c,x+w*.29,y+h*.3,w*.4,h*.17,'#efbc70');
  for(let i=1;i<4;i++)line(c,'#18272f',2,[x+w*i/4,y+h*.25],[x+w*i/4,y+h*.53]);
  box(c,x+w*.12,y+h*.84,w*.12,h*.16,'#26343b');box(c,x+w*.76,y+h*.84,w*.12,h*.16,'#26343b');
}
function boat(c,x,y,w,h) {
  c.fillStyle='#10232977';c.beginPath();c.ellipse(x+w*.53,y+h*.56,w*.53,h*.53,0,0,Math.PI*2);c.fill();
  c.fillStyle='#a06842';c.beginPath();c.moveTo(x+w*.5,y);c.bezierCurveTo(x+w*1.18,y+h*.34,x+w*.95,y+h*.89,x+w*.5,y+h);c.bezierCurveTo(x+w*.05,y+h*.89,x-w*.18,y+h*.34,x+w*.5,y);c.fill();
  c.strokeStyle='#e1bd87';c.lineWidth=4;c.stroke();
  for(let i=1;i<7;i++){const k=i/7,span=Math.sin(k*Math.PI)*w*.7;line(c,'#553d31',4,[x+w*.5-span/2,y+h*k],[x+w*.5+span/2,y+h*k]);}
  for(const k of [.33,.64]){box(c,x+w*.17,y+h*k,w*.66,h*.07,'#bd9064');box(c,x+w*.2,y+h*k+2,w*.6,2,'#dfb782');}
  line(c,'#e1bd87',3,[x+w*.5,y+h*.05],[x+w*.5,y+h*.94]);
}
function rack(c,x,y,w,h) {
  wooden(c,x,y,w,h*.28);
  for(let i=0;i<4;i++){
    const px=x+w*(.16+i*.22);line(c,'#b99c6e',2,[px,y+h*.2],[px,y+h*.65]);lamp(c,px,y+h*.93,Math.min(h*.52,w*.16));
  }
}
function barrels(c,x,y,w,h) {
  for(let i=0;i<2;i++){
    const bx=x+i*w*.49,bw=w*.48;c.fillStyle='#8b6746';c.beginPath();c.ellipse(bx+bw/2,y+h*.5,bw*.5,h*.5,0,0,Math.PI*2);c.fill();
    for(const k of [.24,.71])box(c,bx,y+h*k,bw,h*.08,'#465557');
    line(c,'#bd9561',1,[bx+bw*.3,y+h*.12],[bx+bw*.25,y+h*.88]);
    line(c,'#4c392d',1,[bx+bw*.62,y+h*.12],[bx+bw*.67,y+h*.88]);
  }
}
function stairs(c,x,y,w,h) {
  box(c,x+6,y+8,w,h,'#13283088');
  for(let i=0;i<8;i++){
    const inset=i*w*.035,top=y+i*h*.12;box(c,x+inset,top,w-inset,h*.12,'#6a7774');
    box(c,x+inset,top,w-inset,2,'#b1b5a0');
  }
  line(c,'#b8b18c',4,[x+w*.08,y+h*.94],[x+w*.35,y+h*.04]);
  line(c,'#263a40',5,[x+w*.97,y+h*.94],[x+w*.97,y+h*.02]);
}
function lens(c,x,y,w,h) {
  c.save();c.translate(x+w*.5,y+h*.5);c.scale(w*.5,h*.5);
  c.fillStyle='#263c43';c.beginPath();c.ellipse(0,.12,1,1,0,0,Math.PI*2);c.fill();
  const glow=c.createRadialGradient(-.2,-.35,.03,0,0,.9);glow.addColorStop(0,'#e8f2d0');glow.addColorStop(.3,'#8bc2b5');glow.addColorStop(1,'#2d696e');
  c.fillStyle=glow;c.beginPath();c.ellipse(0,-.1,.82,.82,0,0,Math.PI*2);c.fill();
  c.strokeStyle='#d1b67c';c.lineWidth=.045;
  for(let i=1;i<5;i++){c.beginPath();c.ellipse(0,-.1,i*.16,i*.16,0,0,Math.PI*2);c.stroke();}
  c.strokeStyle='#e3cea0';c.lineWidth=.06;c.strokeRect(-.91,-.98,1.82,1.82);
  c.restore();
}
export function paintFurniture(c, object, width, height) {
  const draw={shelf,desk,bed,stove,boat,rack,barrels,stairs,lens,cabinet:wooden}[object.kind];
  draw?.(c,object.x*width,object.y*height,object.w*width,object.h*height);
}
