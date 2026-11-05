// Default disconnected case adapter. It invents no kit, award, save or solve before A2/A3 connect.
import {emptyExtensions} from './extensions.js';
import {bindCaseMethods,copyView} from './contract.js';
export function createUnavailableCaseAdapter() {
  let revision=0;
  const view={...emptyExtensions(),schema:1,mode:'unavailable',revision,now:0,captain:{name:'Captain pending',coins:null,save:{state:'local',label:'Local intro only'}},
    arrival:{status:'pending',title:'Your story is ready',endingLabel:'Act 1 complete',message:'The referee will confirm your kit when the case service connects.',items:[]},
    permissions:{createCrew:false,joinCrew:false,muster:false},crew:{status:'disconnected',code:null,seats:[],joinPreview:null},board:{cards:[],deductions:[],suspects:[]},search:{spots:[]},partners:[],finale:{phase:'waiting',lights:[]},
    accusation:{allowed:false,suspects:[],evidence:[]},reveal:{available:false,lines:[],index:0},world:{stage:'dark',lightsOn:false,wall:[],festivalRemaining:0},notice:{reason:'not_connected',message:'The case service is not connected yet.'},effects:[]};
  const listeners=new Set();
  const adapter={read:()=>copyView(view),subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},tick(){},dispose(){listeners.clear();}};
  return bindCaseMethods(adapter,async name=>{if(name==='completeIntro'){view.revision=++revision;for(const listener of listeners)listener({type:'case_updated',view:copyView(view)});}return {accepted:false,reason:'not_connected',message:view.notice.message,view:copyView(view)};});
}
