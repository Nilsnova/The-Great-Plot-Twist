// Host page entry: safe callback handling, memory-only session and explicit refresh (no polling).
import { session } from '../online/session.js';
import { createHostApi } from './api.js';
import { createHostController } from './controller.js';
import { createHostView } from './view.js';
import { takeCallback, finishHostLogin, startHostLogin } from './auth.js';

const callback=takeCallback(location,history);
const api=createHostApi({session});
const view=createHostView();
const controller=createHostController({api,view});
view.bind({refresh:()=>controller.refresh(),closeCrew:(id,confirmed)=>controller.closeCrew(id,confirmed),
  newCode:confirmed=>controller.newCode(confirmed),
  cleanup:confirmed=>controller.cleanupGuests(confirmed),signIn:async()=>{
    try {await startHostLogin();} catch {view.say('Sign-in unavailable. Check the project and callback settings.');}
  },forget:()=>{session.clearToken();api.resetHeaders();controller.lock();view.signedIn(false);}});
try {
  await finishHostLogin(callback,session);
  view.signedIn(session.isSignedIn());
  await controller.refresh();
} catch {controller.lock('Sign-in could not be completed. Sign in again in this tab.');}
