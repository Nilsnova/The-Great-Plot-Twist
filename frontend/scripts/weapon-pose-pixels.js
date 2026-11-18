// Browser-only RGBA fingerprints: preserve the approved musket while other grips change.
export async function musketPixels(page) {
  return page.evaluate(async()=>{
    const {paint}=await import('/src/art/paint.js');
    const {weaponPose,CAPTAIN_PALETTES}=await import('/src/art/people.js');
    const directions=[[8,0],[-8,0],[0,-8],[0,8],[8,-8],[-8,8],[-8,-8],[8,8],[2,-7],[7,-2]];
    const angles=[null,...directions.map(([x,z])=>Math.atan2(z*.72,Math.abs(x)))], hashes={};
    for(let color=0;color<10;color++)for(const firing of [false,true])for(const [i,angle] of angles.entries()){
      const canvas=paint(weaponPose(CAPTAIN_PALETTES[color],'musket',firing,angle),[48,32],3);
      const rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      const digest=await crypto.subtle.digest('SHA-256',rgba);
      hashes[`${color}:${firing}:${i}`]=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
    }
    return hashes;
  });
}
