// Canonical terrain samples at four times the legacy linear density; no geometry changes.
import {terrainHeight} from '../../src/world/terrain.js';
const width=4096,height=3072,pixels=Buffer.alloc(width*height);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const h=terrainHeight((x-width/2)/64,(y-height/2)/(64*.72));
 pixels[y*width+x]=(h>1?2:h>.03?1:0)+(h>6.2?8:0);
}
process.stdout.write(pixels);
