// Beam bearings are local controls. Only aim() answers whether a beam is locked.
import {node,button,secondsLabel,restoreFocus} from './helpers.js';
import {getPreferences} from '../settings/preferences.js';
import {normaliseDegrees,pointerBearing} from './beam-math.js';
const highlight=()=>getPreferences().colourblind?'#d5f5ff':'#f3d58c';
const radians=value=>value*Math.PI/180;
export function createFinaleScreen({send,navigate,openIslet}){
  const element=node('section','case-finale'),angles=new Map(),reportedAngles=new Map();
  let model=null,bindings=[],selected=null,lastPad=0,chartStamp='',disposed=false,renderGeneration=0;
  function setAngle(binding,value){
    const angle=normaliseDegrees(Math.round(normaliseDegrees(Number.isFinite(value)?value:0)));angles.set(binding.id,angle);
    binding.range.value=angle;binding.output.textContent=`${angle}°`;drawDial(binding,angle);
  }
  function drawDial(binding,angle){
    const d=binding.canvas.getContext('2d');d.setTransform(3,0,0,3,0,0);d.clearRect(0,0,120,120);
    const face=d.createRadialGradient(60,52,8,60,60,57);face.addColorStop(0,'#365c60');face.addColorStop(1,'#102d35');
    d.fillStyle=face;d.beginPath();d.arc(60,60,56,0,Math.PI*2);d.fill();d.strokeStyle='#b3b692';d.lineWidth=1;d.stroke();
    for(let degree=0;degree<360;degree+=10){const a=radians(degree),size=degree%30===0?7:3;
      d.strokeStyle=degree%30===0?'#d8cda6':'#78928a';d.beginPath();d.moveTo(60+Math.sin(a)*(50-size),60-Math.cos(a)*(50-size));d.lineTo(60+Math.sin(a)*50,60-Math.cos(a)*50);d.stroke();}
    d.fillStyle='#f4e5bb';d.font='600 11px system-ui';d.textAlign='center';d.textBaseline='middle';
    for(const [label,x,y] of [['N',60,25],['E',95,60],['S',60,95],['W',25,60]])d.fillText(label,x,y);
    d.save();d.translate(60,60);d.rotate(radians(angle));d.shadowColor=highlight();d.shadowBlur=7;
    d.fillStyle=highlight();d.beginPath();d.moveTo(0,-43);d.lineTo(5,5);d.lineTo(0,0);d.lineTo(-5,5);d.closePath();d.fill();d.restore();
    d.fillStyle='#efe1b7';d.beginPath();d.arc(60,60,3,0,Math.PI*2);d.fill();
  }
  function drawChart(canvas,night){
    const d=canvas.getContext('2d');d.setTransform(4,0,0,4,0,0);d.clearRect(0,0,224,128);
    const sea=d.createLinearGradient(0,0,224,128);sea.addColorStop(0,'#12313f');sea.addColorStop(1,'#28535b');d.fillStyle=sea;d.fillRect(0,0,224,128);
    d.strokeStyle='#b6d4c314';d.lineWidth=.4;
    for(let x=14;x<224;x+=24){d.beginPath();d.moveTo(x,0);d.lineTo(x,128);d.stroke();}
    for(let y=10;y<128;y+=24){d.beginPath();d.moveTo(0,y);d.lineTo(224,y);d.stroke();}
    // Decorative coastline does not encode an unearned destination or bearing.
    d.fillStyle='#4f7363';d.strokeStyle='#b7b483';d.lineWidth=.7;d.beginPath();
    d.moveTo(0,104);d.bezierCurveTo(27,83,22,115,60,104);d.bezierCurveTo(86,94,93,118,125,109);d.bezierCurveTo(148,98,165,116,184,104);d.lineTo(224,119);d.lineTo(224,128);d.lineTo(0,128);d.closePath();d.fill();d.stroke();
    d.fillStyle='#d5e2cd';d.font='600 7px system-ui';d.fillText('N ↑',9,12);
    for(const [i,light] of (night.lights??[]).entries()){
      const x=light.x/2,y=light.y/2;if(!Number.isFinite(x)||!Number.isFinite(y))continue;
      if(light.post){const a=radians(light.bearing??0);d.strokeStyle=light.lock?highlight():'#b5d2c380';d.lineWidth=light.lock?1.6:.8;d.beginPath();d.moveTo(x,y);d.lineTo(x+Math.sin(a)*29,y-Math.cos(a)*29);d.stroke();}
      d.fillStyle=light.id===selected?highlight():'#244039';d.strokeStyle=light.ready?'#ead9a9':'#789086';d.lineWidth=light.id===selected?1.5:.7;
      d.beginPath();d.arc(x,y,6,0,Math.PI*2);d.fill();d.stroke();d.fillStyle=light.id===selected?'#17323a':'#f0e3bb';d.font='600 8px system-ui';d.textAlign='center';d.fillText(String(i+1),x,y+3);d.textAlign='start';
    }
    if(night.glow&&Number.isFinite(night.glow.x)&&Number.isFinite(night.glow.y)){
      const x=night.glow.x/2,y=night.glow.y/2,glow=d.createRadialGradient(x,y,0,x,y,13);glow.addColorStop(0,highlight());glow.addColorStop(.15,highlight()+'bb');glow.addColorStop(1,highlight()+'00');d.fillStyle=glow;d.fillRect(x-13,y-13,26,26);d.fillStyle=highlight();d.beginPath();d.arc(x,y,2,0,Math.PI*2);d.fill();
    }
  }
  function selectLight(id){
    selected=id;chartStamp='';for(const item of bindings){item.row.hidden=item.id!==id;item.tab.setAttribute('aria-pressed',String(item.id===id));}
    refreshChart();
  }
  function refreshChart(){
    const canvas=element.querySelector('.case-bearing-chart canvas');if(!canvas||!model)return;
    const stamp=JSON.stringify([selected,model.phase,model.glow,model.lights?.map(light=>[light.id,light.ready,light.bearing,!!light.post,!!light.lock]),highlight()]);
    if(stamp===chartStamp)return;chartStamp=stamp;drawChart(canvas,model);
  }
  return {element,update(view){
    if(disposed)return;const generation=++renderGeneration;
    model=view.finale;restoreFocus(element,()=>{
      bindings=[];chartStamp='';element.replaceChildren();
      const figure=node('figure','case-bearing-chart'),map=node('canvas');map.width=896;map.height=512;
      map.setAttribute('role','img');map.setAttribute('aria-label',model.chartDescription??'Coastal chart. North is up. Numbered markers show the supplied light posts.');
      figure.append(map,node('figcaption','',model.glow?'Find the glow. North is up.':'Light posts · north is up.'));
      const connected=view.mode!=='unavailable'&&view.crew?.status==='active'&&(model.lights?.length??0)>0;
      if(!connected){
        const empty=node('div','case-night-empty');empty.append(node('h3','','Three lights. One crew.'),node('p','',view.mode==='unavailable'?'Online play is still being connected. Your local intro stays on this device.':view.crew?.status==='active'?'Prepare your signal station on your home islet.':'Start or join a crew to prepare the lights together.'),button('Open crew',()=>navigate('crew'),{focus:'night-crew'}));
        if(model.islet){
          const station=model.islet,card=node('article','case-light case-islet-light');
          card.append(node('h3','',station.name),node('p','case-caption',station.caption));
          if(!station.built)card.append(button(station.buildLabel,()=>{if(!disposed&&generation===renderGeneration)return send('buildLight',station.id);},
            {disabled:station.canBuild!==true,focus:`build-${station.id}`}));
          if(typeof openIslet==='function')card.append(button('Open your islet',()=>{if(!disposed&&generation===renderGeneration)openIslet();},{quiet:true,focus:'finale-open-islet'}));
          empty.append(card);
        }
        element.append(empty,figure);refreshChart();return;
      }
      const header=node('div','case-night-overview'),status=node('p','case-night-status',model.status??''),clock=node('p','case-night-clock');
      header.append(status,clock);const action=node('div','case-night-action');
      action.append(button('Call nightfall',()=>send('callNightfall'),{disabled:!model.canCall,focus:'nightfall'}));
      const board=button('Board the schooner',()=>navigate('accusation'),{focus:'night-board'});board.hidden=model.phase!=='success';action.append(board);
      const tabs=node('div','case-light-tabs');tabs.setAttribute('aria-label','Choose a light');
      if(!model.lights.some(light=>light.id===selected))selected=(model.lights.find(light=>light.canAim)??model.lights[0]).id;
      const grid=node('div','case-lights');
      for(const [i,light] of model.lights.entries()){
        const tab=button(`${i+1}`,()=>selectLight(light.id),{quiet:true,focus:`light-tab-${light.id}`,ariaLabel:`${i+1}. ${light.name}`});tab.setAttribute('aria-pressed',String(selected===light.id));tabs.append(tab);
        const row=node('article','case-light');row.dataset.light=light.id;row.hidden=light.id!==selected;row.append(node('h3','',`${i+1}. ${light.name}`));
        const status=node('p','case-post-status');row.append(status);
        const prepare=node('div','case-light-prepare');if(!light.ready)prepare.append(button(light.buildLabel,()=>send('buildLight',light.id),{disabled:!light.canBuild,focus:`build-${light.id}`}));
        const take=button('Take this post · 1 minute',()=>send('takePost',light.id),{disabled:!light.canTake,focus:`post-${light.id}`,ariaLabel:`Take this post · 1 minute · ${light.name}`});prepare.append(take);row.append(prepare);
        const aim=node('div','case-light-aim'),canvas=node('canvas','case-compass');canvas.width=360;canvas.height=360;canvas.setAttribute('aria-hidden','true');canvas.style.touchAction='none';
        const label=node('label','case-bearing-input'),range=node('input');range.type='range';range.min='0';range.max='359';range.step='1';range.dataset.focus=`bearing-${light.id}`;range.setAttribute('aria-label',`${light.name} bearing in degrees`);const output=node('output');
        label.append(node('span','','Aim the beam'),range,output);
        const lock=button('Lock this beam',()=>send('aim',light.id,angles.get(light.id)??light.bearing??0),{disabled:!light.canAim,focus:`lock-${light.id}`,ariaLabel:`Lock this beam · ${light.name}`});
        const binding={id:light.id,row,tab,canvas,range,output,lock,take,status};bindings.push(binding);
        range.oninput=()=>setAngle(binding,Number(range.value));
        canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);setAngle(binding,pointerBearing(canvas.getBoundingClientRect(),e.clientX,e.clientY));};
        canvas.onpointermove=e=>{if(canvas.hasPointerCapture(e.pointerId))setAngle(binding,pointerBearing(canvas.getBoundingClientRect(),e.clientX,e.clientY));};
        aim.append(canvas,label);row.append(aim,lock);setAngle(binding,angles.get(light.id)??light.bearing??0);grid.append(row);
      }
      const layout=node('div','case-night-layout'),mapArea=node('div','case-night-map');mapArea.append(figure,tabs,node('p','case-night-guide',model.phase==='night'?'Choose a post. Aim at the glow. Lock your beam.':model.phase==='success'?'Three beams meet. The way is open.':'Prepare the posts, then call nightfall.'));
      header.append(action);layout.append(mapArea,grid);element.append(header,layout);
      const help=node('details','case-night-help');help.append(node('summary','','How to aim'),node('p','case-caption','Drag the compass or use the slider and arrow keys. North is 0°, east is 90°. Gamepad left/right adjusts a focused slider. Locks last 90 seconds.'));
      if(model.chartDescription)help.append(node('p','case-caption',model.chartDescription));
      const jobs=node('div','case-build-jobs');for(const job of model.buildJobs??[])jobs.append(node('p','',job.done?job.report:`Preparing light · ${secondsLabel(job.remaining)}`));
      element.append(help,jobs);
    });this.tick(view);
  },tick(view){if(disposed)return;
    model=view.finale;refreshChart();const clock=element.querySelector('.case-night-clock');
    if(clock)clock.textContent=model.phase==='dawn'?`Next night · ${secondsLabel(model.dawnRemaining)}`:model.phase==='night'?`Night · ${secondsLabel(model.remaining)}`:model.phase==='success'?'Three lights locked':'Prepare your lights';
    const call=element.querySelector('[data-focus="nightfall"]');if(call){call.disabled=!model.canCall;call.hidden=model.phase==='success';}
    for(const binding of bindings){
      const light=model.lights.find(light=>light.id===binding.id);if(!light)continue;
      const reported=light.bearing??0;
      if(reportedAngles.has(light.id)&&reportedAngles.get(light.id)!==reported)setAngle(binding,reported);
      reportedAngles.set(light.id,reported);
      binding.lock.disabled=!light.canAim;binding.take.disabled=!light.canTake;
      binding.tab.dataset.state=light.lock?'locked':light.post?'occupied':light.ready?'ready':'unbuilt';
      binding.status.textContent=light.lock?`Locked · ${secondsLabel(light.lock.remaining)}`:light.post?`${light.post.label} · ${light.post.reserved?`arrives in ${secondsLabel(light.post.remaining)}`:'on post'}`:light.ready?'Open post':'Light not ready';
    }
    // Native sliders cover keyboard/touch; the standard pad also adjusts a focused slider.
    if(element.isConnected&&performance.now()-lastPad>120){
      const binding=bindings.find(item=>item.range===document.activeElement);let pad;
      try{pad=navigator.getGamepads?.()?.find(p=>p?.connected);}catch{/* Native inputs remain available. */}
      if(binding&&pad&&Math.abs(pad.axes[0]??0)>.4){lastPad=performance.now();setAngle(binding,(angles.get(binding.id)??0)+Math.sign(pad.axes[0])*2);}
    }
  },dispose(){if(disposed)return;disposed=true;renderGeneration++;model=null;bindings=[];angles.clear();reportedAngles.clear();element.replaceChildren();element.remove();}};
}
