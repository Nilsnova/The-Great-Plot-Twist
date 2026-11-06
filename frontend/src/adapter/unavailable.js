// Safe disconnected adapter. Local intro continuation is available; no account, kit or solve is invented.
import {emptyExtensions} from './extensions.js';
import {bindCaseMethods,copyView} from './contract.js';
export function createUnavailableCaseAdapter(){
  let disposed=false;
  const view={...emptyExtensions(),schema:1,mode:'unavailable',revision:0,now:0,
    captain:{name:'Captain pending',coins:null,save:{state:'idle',label:'Local intro only'}},
    arrival:{status:'pending',title:'Your story is ready',endingLabel:'Act 1 complete',message:'Connect to confirm your kit.',items:[]},
    permissions:{createCrew:false,joinCrew:false,muster:false},crew:{status:'disconnected',code:null,seats:[],joinPreview:null},
    board:{cards:[],deductions:[],suspects:[]},search:{spots:[],routes:[],jobs:[]},partners:[],finale:{phase:'waiting',lights:[]},
    accusation:{allowed:false,suspects:[],evidence:[]},reveal:{available:false,lines:[],index:0},
    world:{stage:'dark',lightsOn:false,wall:[],festivalRemaining:0},
    notice:{reason:'not_connected',message:'The case is offline.'},effects:[]};
  const listeners=new Set();
  const read=()=>copyView(view);
  function publish(){for(const listener of listeners)listener({type:'case_updated',view:read()});}
  async function dispatch(name){
    if(disposed)return {accepted:false,reason:'disposed',message:'This client has closed.',view:read()};
    if(name==='continueGame'){
      view.continuation={source:'local',kind:'intro',actions:null,place:'lighthouse_isle'};
      view.revision++;publish();return {accepted:true,reason:null,message:'The local intro is ready.',view:read()};
    }
    if(name==='completeIntro'){view.revision++;publish();}
    return {accepted:false,reason:'not_connected',message:view.notice.message,view:read()};
  }
  return bindCaseMethods({read,tick(){},
    subscribe(listener){if(disposed)return()=>{};listeners.add(listener);return()=>listeners.delete(listener);},
    dispose(){disposed=true;listeners.clear();},
  },(name)=>dispatch(name));
}
