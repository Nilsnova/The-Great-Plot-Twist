// Account summaries and arrival data use server answers, without granting local kit rules.
import {kitDisplay} from '../../adapter/shared/kits.js';
import {placeLabel} from '../../world/places/labels.js';
import {validReplay} from './replay.js';

const saveStates=new Set(['idle','saving','saved','offline','conflict']);
const accountStates=new Set(['signed_out','signing_in','signed_in','expired','error']);
const text=value=>typeof value==='string'?value:null;

function saveSummary(save,source,available){
  const exists=available&&validReplay(save?.data);
  const empty=source==='device'?'No intro progress saved on this device':'No cloud save';
  const label=source==='device'?'Intro saved on this device':'Cloud progress saved';
  return {state:exists?'saved':'idle',label:exists?label:empty,updatedAt:exists?save.updatedAt??null:null};
}

function selectedSource(state,device,cloud){
  if(state.saveState==='conflict')return null;
  if(state.continuation?.source==='local'&&device.state==='saved')return 'device';
  if(state.continuation?.source==='cloud'&&cloud.state==='saved')return 'cloud';
  if(cloud.state==='saved')return 'cloud';
  return device.state==='saved'?'device':null;
}

function accountSave(state){
  const device=saveSummary(state.deviceSave,'device',true);
  const cloud=saveSummary(state.cloudSave,'cloud',state.accountState==='signed_in');
  const source=selectedSource(state,device,cloud);
  const chosen=source==='cloud'?cloud:source==='device'?device:null;
  const saveState=saveStates.has(state.saveState)?state.saveState:'idle';
  const labels={saving:'Saving progress',offline:'Offline; progress on this device is kept',
    conflict:'Choose which saved game to keep'};
  return {state:saveState,source,label:labels[saveState]??chosen?.label??'No saved progress',
    updatedAt:chosen?.updatedAt??null,device,cloud};
}

// /api/config auth.providers names the sign-in choices (github, email); GitHub alone when missing.
function providerList(config){
  const list=Array.isArray(config?.auth?.providers)?config.auth.providers.filter(name=>['github','email'].includes(name)):[];
  return list.length?[...new Set(list)]:['github'];
}

export function mapAccount(state={}){
  const save=accountSave(state);
  const accountState=accountStates.has(state.accountState)?state.accountState:'signed_out';
  const canResumeWorld=accountState==='signed_in'&&!!kitDisplay(state.me?.kit);
  return {state:accountState,captainName:text(state.me?.captainName)??text(state.nameReply?.captainName),
    canSignIn:state.signInAllowed!==false&&state.auth?.configured!==false,
    signInMessage:state.auth?.configured===false?(text(state.auth?.message)||'Sign-in is not set up on this build.'):
      state.signInAllowed===false?'Sign-in opens later. Your progress on this device is kept.':text(state.auth?.message)??'',
    connection:state.connection?{...state.connection}:{state:'idle',message:'',reason:null},
    canReroll:accountState==='signed_in'&&state.nameReply?.rerollsLeft>0,
    namePending:accountState==='signed_in'&&!state.nameReply,
    canRetryName:accountState==='signed_in'&&state.nameStatus==='unavailable',
    hasKit:!!(state.me?.kit||state.profile?.kit),
    canContinue:save.state!=='conflict'&&(!!save.source||canResumeWorld),save,
    guest:accountState==='signed_in'&&state.auth?.guest===true,providers:providerList(state.config)};
}

function arrivalKit(state){
  const source=state.profile?.kit??state.me?.kit;
  const display=kitDisplay(source);
  if(!display)return null;
  const startPlace=text(state.profile?.kit?.startPlace)??text(state.me?.place);
  return {...display,item:text(state.profile?.kit?.item?.name)??'',startPlace,startLabel:placeLabel(startPlace)};
}

function endingLabel(ending){
  if(ending==='ending_rescue')return 'Rescue ending';
  if(ending==='ending_trapped')return 'Tower ending';
  return 'Act 1 complete';
}

export function mapArrival(state={}){
  const kit=arrivalKit(state);
  const profile=state.profile;
  const readLog=profile?.readLog===true;
  const alreadyGranted=profile?.alreadyGranted===true;
  const coins=Number.isFinite(profile?.kit?.coins)?profile.kit.coins:null;
  return {status:kit?'ready':'pending',title:alreadyGranted?'Welcome back':kit?'Keep your story':'Your story is ready',
    endingLabel:endingLabel(profile?.ending),kit,coins,items:kit?.item?[kit.item]:[],readLog,
    logCard:readLog?{title:'Your logbook lead',message:'Your saved logbook lead is available for the case.'}:null,
    destination:text(state.me?.place)??kit?.startPlace??null,
    message:kit?(alreadyGranted?'Your original kit is kept. No second grant was made.':'Your kit is confirmed.')
      :'Sign in with GitHub to claim your kit. Your progress on this device is kept.'};
}
