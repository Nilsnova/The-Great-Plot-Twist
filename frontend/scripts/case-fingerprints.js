// Build-time helpers hash protected server text; no protected words enter client files.
import {createHash} from 'node:crypto';
export function headHash(text){let hash=0;for(let index=0;index<text.length;index++)hash=(Math.imul(hash,31)+text.charCodeAt(index))>>>0;return hash;}
export function fingerprint(text,label){const headLength=Math.min(14,text.length);return {label,length:text.length,headLength,headHash:headHash(text.slice(0,headLength)),sha256:createHash('sha256').update(text).digest('hex')};}
export function protectedCaseLines(data){
 const reveal=data?.reveal;if(!reveal)throw new Error('Server reveal section is missing.');
 const lines=(reveal.lines??[]).map((line,index)=>({label:`reveal-${index+1}`,text:line.text}));
 for(const [kit,line] of Object.entries(reveal.closing_lines??{}))lines.push({label:`closing-${kit}`,text:line.text});
 for(const key of ['log_reader_line','last_beat'])if(reveal[key])lines.push({label:key,text:reveal[key].text});
 if(lines.length<10||lines.some(line=>typeof line.text!=='string'||!line.text.length))throw new Error('Server reveal lines are incomplete.');
 return lines;
}
