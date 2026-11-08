// Search routes and timers. The adapter supplies windows, prices, availability and completions.
import {node,button,labelledSelect,restoreFocus,secondsLabel} from './helpers.js';
import {createProgress} from '../ui/kit/progress.js';
export function createSearchScreen({send}) {
  const element=node('section','case-search'),timers=new Map();
  return {element,update(view){restoreFocus(element,()=>{
    for(const timer of timers.values())timer.dispose();timers.clear();element.replaceChildren();const search=view.search;
    element.append(node('p','case-clock',search.clockLabel??''),node('h3','',search.label??'Your satchel'));
    if(search.allowSpotPicker){const field=labelledSelect('Local rehearsal spot',search.spots,id=>send('inspectSpot',id),{value:search.activeSpot,focus:'search-spot'});element.append(field.element);}
    const routes=node('div','case-search-routes');
    for(const route of search.routes??[]){const row=node('article','case-route');row.dataset.route=route.id;row.append(node('h4','',route.title),node('p','',route.label));
      row.append(node('p','case-caption',`${route.price?`${route.price} coins`:'Free'} · ${Math.floor(route.seconds/60)} minute search${route.kitName?` · ${route.kitName}`:''}`));
      row.append(node('p','case-route-status',route.statusText),button(route.price?`Pay ${route.price} coins · Start search`:'Start free search',()=>send('search',route.id,{paidConfirmed:route.price>0}),{disabled:!route.canStart,focus:`search-${route.id}`,ariaLabel:`${route.price?`Pay ${route.price} coins · Start search`:`Start free search`} · ${route.title}`}));routes.append(row);}
    if(!(search.routes??[]).length)routes.append(node('p','','No search route is available at this spot.'));element.append(routes);
    const jobs=node('section','case-search-jobs');jobs.append(node('h3','','Your searches'));
    for(const job of search.jobs??[]){const row=node('article','case-job');row.dataset.job=job.id;const progress=createProgress({label:job.title,value:job.total-job.remaining,max:job.total||1});timers.set(job.id,progress);row.append(progress.element,node('p','case-job-report',job.done?job.report:`Searching · ${secondsLabel(job.remaining)}`));jobs.append(row);}element.append(jobs);
  });},tick(view){const search=view.search;const clock=element.querySelector('.case-clock');if(clock)clock.textContent=search.clockLabel??'';
    for(const route of search.routes??[]){const row=[...element.querySelectorAll('[data-route]')].find(node=>node.dataset.route===route.id);if(row){row.querySelector('.case-route-status').textContent=route.statusText;row.querySelector('button').disabled=!route.canStart;}}
    for(const job of search.jobs??[]){const row=element.querySelector(`[data-job="${job.id}"]`);if(row){timers.get(job.id)?.update({value:job.total-job.remaining,max:job.total||1});row.querySelector('.case-job-report').textContent=job.done?job.report:`Searching · ${secondsLabel(job.remaining)}`;}}
  },dispose(){for(const timer of timers.values())timer.dispose();timers.clear();element.remove();}};
}
