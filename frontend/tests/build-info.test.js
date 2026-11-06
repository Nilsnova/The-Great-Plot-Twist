// Deployment stamp must cover every emitted JS/CSS file without exposing build environment data.
import {describe,it,expect} from 'vitest';
import {buildInfoPlugin} from '../scripts/build-info.js';

describe('public deployment stamp',()=>{
  it('records only commit/time and the complete emitted text-asset list',()=>{
    const emitted=[],commit='a'.repeat(40),builtAt='2026-11-06T12:00:00.000Z';
    const plugin=buildInfoPlugin({commit,builtAt});
    plugin.generateBundle.handler.call({emitFile:value=>emitted.push(value)},{},{
      entry:{fileName:'assets/title.js'},lazy:{fileName:'assets/world.js'},
      css:{fileName:'assets/style.css'},html:{fileName:'index.html'},image:{fileName:'world.png'},
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0].fileName).toBe('build-info.json');
    expect(JSON.parse(emitted[0].source)).toEqual({commit,builtAt,
      assets:['assets/style.css','assets/title.js','assets/world.js']});
  });
  it('refuses a missing or untrusted commit instead of publishing an ambiguous stamp',()=>{
    const plugin=buildInfoPlugin({commit:'unknown',builtAt:'2026-11-06T12:00:00.000Z'});
    expect(()=>plugin.generateBundle.handler.call({emitFile(){}},{},{})).toThrow('commit');
  });
});
