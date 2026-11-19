// Node equivalent of Vite's unchanged local JSON imports for the pure production simulation.
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
const productionRoot=new URL('../src/',import.meta.url).href;
registerHooks({load(url,context,nextLoad){
 if(url.startsWith(productionRoot)&&url.endsWith('.json')){
  const value=JSON.parse(readFileSync(new URL(url),'utf8'));
  return {format:'module',source:'export default '+JSON.stringify(value)+';',shortCircuit:true};
 }
 return nextLoad(url,context);
}});
