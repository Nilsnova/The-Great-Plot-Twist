// Keep account-modal code off the cold title; pending imports remain cancellable with Escape.
export function createLazyAccountHost(ctx){
  let host=null,task=null,active=false,disposed=false,token=0;
  return {get active(){return active||!!host?.active;},
    async open(){const request=++token;active=true;
      task??=import('./account-host.js').then(module=>{if(!disposed)host=module.createAccountHost(ctx);}).catch(()=>{task=null;});
      await task;if(disposed||request!==token)return;active=false;await host?.open();
    },close(){token++;active=false;host?.close();},update(view){host?.update(view);},notice(message){host?.notice(message);},
    dispose(){disposed=true;token++;active=false;host?.dispose();},
  };
}
