// Build a GitHub issue draft from an explicit allow-list; never serialize the caller's object.
import {places} from '../world/places/registry.js';
import {allowedUiActions} from './ui-actions.js';
const placeIds=new Set([...Object.keys(places),'not_started']);
const inputTypes=new Set(['touch','mouse','gamepad']);
const dimension=value=>Number.isFinite(value)&&value>0?Math.min(16384,Math.floor(value)):null;
function buildIdentity(value){
  const sha=typeof value?.sha==='string'&&/^[a-f0-9]{7}$/i.test(value.sha)?value.sha.toLowerCase():'dev';
  const text=typeof value?.builtAt==='string'?value.builtAt:'';
  const valid=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text)&&Number.isFinite(Date.parse(text));
  return {sha,builtAt:valid?new Date(text).toISOString():null};
}
export function sanitizeProblemReport(input={}){
  const value=input&&typeof input==='object'?input:{};
  const width=dimension(value.viewport?.width),height=dimension(value.viewport?.height);
  return {build:buildIdentity(value.build),placeId:placeIds.has(value.placeId)?value.placeId:null,
    viewport:width&&height?{width,height}:null,inputType:inputTypes.has(value.inputType)?value.inputType:null,
    actions:Array.isArray(value.actions)?value.actions.filter(action=>allowedUiActions.has(action)).slice(-10):[]};
}
export function createProblemUrl(input){
  const value=sanitizeProblemReport(input),url=new URL('https://github.com/Nilsnova/The-Great-Plot-Twist/issues/new');
  const viewport=value.viewport?`${value.viewport.width} × ${value.viewport.height}`:'Unavailable';
  const body=[`Build: ${value.build.sha}`,`Built at: ${value.build.builtAt??'Unavailable'}`,`Place: ${value.placeId??'Unavailable'}`,
    `Viewport: ${viewport}`,`Input: ${value.inputType??'Unavailable'}`,'','Last UI actions:',...value.actions.map(action=>`- ${action}`),'','## What happened?','',''].join('\n');
  url.searchParams.set('title',`Problem with build ${value.build.sha}`);url.searchParams.set('body',body);
  if(url.href.length>=7000)throw new RangeError('Problem report exceeds its URL budget');
  return url.href;
}
