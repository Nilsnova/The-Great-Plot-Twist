// Retain exact bundled dependency notices and Vite's distributed browser-helper notices.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url);
export const noticesFile='third-party-notices.md';
export function thirdPartyNoticesPlugin() {
  return {name:'plot-twist-third-party-notices',generateBundle:{order:'post',handler(_,bundle){
    const asset=bundle[noticesFile];
    if(!asset||asset.type!=='asset'||typeof asset.source!=='string')throw new Error('Bundled dependency notices are missing.');
    // Vite's virtual preload helpers are excluded from its automatic package enumeration.
    // Keep the installed Vite distribution's exact licence/notice text too.
    const viteLicense=readFileSync(join(dirname(require.resolve('vite/package.json')),'LICENSE.md'),'utf8').trim();
    asset.source+=`\n\n# Vite and distributed helper notices\n\n${viteLicense}\n`;
  }}};
}
