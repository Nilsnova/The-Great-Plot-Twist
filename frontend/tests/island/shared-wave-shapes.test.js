// Frozen numerical weather and canonical kind are distinct producer fields.
import {it,expect} from 'vitest';
import {readNativeWave} from '../../src/island/shared-wave-shapes.js';
import {proof} from './shared-session-fixture.js';
import {nativeWave} from './shared-wave-fixture.js';
it.each(['calm','storm'])('accepts producer weather without a duplicate snapshot kind: %s',kind=>{
 const wave=nativeWave();wave.weather.kind=kind;wave.initialSnapshot.createWave.weatherKind=kind;
 expect(wave.initialSnapshot.weather).not.toHaveProperty('kind');expect(readNativeWave(wave,proof())).not.toBeNull();
});
it('allows a matching optional snapshot kind',()=>{
 const wave=nativeWave();wave.initialSnapshot.weather.kind=wave.weather.kind;expect(readNativeWave(wave,proof())).not.toBeNull();
});
it.each(['frozenKind','optionalKind','ships','fog','label'])('rejects contradictory weather %s',field=>{
 const wave=nativeWave();
 if(field==='frozenKind')wave.initialSnapshot.createWave.weatherKind='storm';
 if(field==='optionalKind')wave.initialSnapshot.weather.kind='storm';
 if(field==='ships')wave.initialSnapshot.weather.ships=2;
 if(field==='fog')wave.initialSnapshot.weather.fog=.4;
 if(field==='label')wave.initialSnapshot.weatherLabel='Other sea';
 expect(readNativeWave(wave,proof())).toBeNull();
});
