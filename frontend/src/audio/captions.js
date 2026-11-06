// Load caption placement with the first cue, keeping the title bootstrap small.
export function createCaptions(container){
  let view,pending,disposed,latest;
  return {show(text){
    if(disposed)return;latest=text;
    if(view)view.show(text);
    else pending??=import('./captions-view.js').then(({default:createCaptionsView})=>{
      if(!disposed)(view=createCaptionsView(container)).show(latest);
    }).catch(()=>pending=null);
  },dispose(){disposed=true;view?.dispose();}};
}
