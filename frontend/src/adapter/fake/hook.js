// The rehearsal hook uses placeholders for all server supplied notice text.
export function fakeHook(){return {id:'chapter_two_hook',notice:{title:'[notice supplied by the server]',text:'[notice supplied by the server]'},beam:{chart:{x:440,y:12},pattern:['short','short','long'],flash:{shortSeconds:.4,longSeconds:1.2,gapSeconds:.5,pauseSeconds:4}}};}
export function hookView(state){return state?.hookFired?fakeHook():null;}
export function setHookScenario(state,fired=true){state.hookFired=Boolean(fired);return state.hookFired;}
