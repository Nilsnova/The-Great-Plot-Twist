// Search routes and timers. The adapter supplies windows, prices, availability and completions.
import {node,button,labelledSelect,restoreFocus,secondsLabel} from './helpers.js';
import {createProgress} from '../ui/kit/progress.js';
import {inspectionLabel} from './inspection-labels.js';
export function createSearchScreen({send,navigate=()=>{}}) {
  const element=node('section','case-search'),timers=new Map();
  return {element,update(view){restoreFocus(element,()=>{
    for(const timer of timers.values())timer.dispose();timers.clear();element.replaceChildren();const search=view.search;
    const spots=search.spots??[],selected=spots.find(spot=>spot.id===search.activeSpot),title=search.activeSpot?
      inspectionLabel(selected?.label??search.label??'Inspection'):spots.length?'Choose what to inspect':'Search the coast';
    element.append(node('p','case-clock',search.clockLabel??''),node('h3','case-inspect-title',title));
    const observation=search.activeSpot&&search.label&&search.label!==title?node('p','case-inspect-observation',search.label):null;
    let picker=null;
    if(spots.length){
      const options=[{id:'',label:'Choose a place or item…'},...spots.map(spot=>({id:spot.id,label:inspectionLabel(spot.label??spot.id)}))];
      const field=labelledSelect('Choose a place or item',options,id=>{if(spots.some(spot=>spot.id===id))send('inspectSpot',id);},
        {value:search.activeSpot??'',focus:'search-spot'});field.select.options[0].disabled=true;
      field.element.classList.add('case-search-picker');picker=field.element;
    }
    const routes=node('div','case-search-routes');
    for(const route of search.routes??[]){const row=node('article','case-route');row.dataset.route=route.id;row.dataset.available=String(route.canStart===true);row.append(node('h4','',route.title),node('p','',route.label));
      const meta=node('p','case-route-meta');meta.append(node('span','kit-badge',route.price?`${route.price} coins`:'Free'),
        node('span','kit-badge',route.seconds?`${Math.ceil(route.seconds/60)} min`:'Instant'));if(route.kitName)meta.append(node('span','kit-badge',route.kitName));row.append(meta);
      row.append(node('p','case-route-status',route.statusText),button(route.price?`Pay ${route.price} coins · Start search`:'Start free search',()=>send('search',route.id,{paidConfirmed:route.price>0}),{disabled:!route.canStart,focus:`search-${route.id}`,ariaLabel:`${route.price?`Pay ${route.price} coins · Start search`:`Start free search`} · ${route.title}`}));routes.append(row);}
    if(!(search.routes??[]).length)routes.append(node('p','inspection-empty',search.activeSpot?
      spots.length?'No route is available here. Choose another place or item above.':'No route is available here yet. Continue exploring the island.':
      spots.length?'Choose a place or item above to begin.':'No search routes are available yet. Return to the island to explore.'));
    const jobs=node('section','case-search-jobs');jobs.append(node('h3','','Your searches'));
    for(const job of search.jobs??[]){const row=node('article','case-job');row.dataset.job=job.id;row.dataset.complete=String(job.done===true);
      const state=node('span','kit-badge case-job-state','Complete');state.hidden=!job.done;
      const progress=createProgress({label:job.title,value:job.total-job.remaining,max:job.total||1});timers.set(job.id,progress);
      row.append(state,progress.element,node('p','case-job-report',job.done?job.report:`Searching · ${secondsLabel(job.remaining)}`));jobs.append(row);}
    if(!(search.jobs??[]).length)jobs.append(node('p','inspection-empty','Your search reports will appear here.'));
    const board=button('View clues on the board',()=>navigate('board'),{focus:'search-board'});board.hidden=!(search.jobs??[]).some(job=>job.done);jobs.append(board);
    const hasJobs=(search.jobs??[]).length>0;
    if(hasJobs)element.append(jobs);if(observation)element.append(observation);if(picker)element.append(picker);
    if(search.activeSpot||!spots.length)element.append(routes);
    else element.append(node('p','case-search-guide','Choose a place or item to begin.'));
    if(!hasJobs)element.append(jobs);
  });},tick(view){const search=view.search;const clock=element.querySelector('.case-clock');if(clock)clock.textContent=search.clockLabel??'';
    for(const route of search.routes??[]){const row=[...element.querySelectorAll('[data-route]')].find(node=>node.dataset.route===route.id);if(row){row.querySelector('.case-route-status').textContent=route.statusText;row.querySelector('button').disabled=!route.canStart;row.dataset.available=String(route.canStart===true);}}
    for(const job of search.jobs??[]){const row=element.querySelector(`[data-job="${job.id}"]`);if(row){timers.get(job.id)?.update({value:job.total-job.remaining,max:job.total||1});row.querySelector('.case-job-report').textContent=job.done?job.report:`Searching · ${secondsLabel(job.remaining)}`;row.dataset.complete=String(job.done===true);row.querySelector('.case-job-state').hidden=!job.done;}}
    const board=element.querySelector('[data-focus="search-board"]');if(board)board.hidden=!(search.jobs??[]).some(job=>job.done);
  },dispose(){for(const timer of timers.values())timer.dispose();timers.clear();element.remove();}};
}
