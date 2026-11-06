// A small world version label; presenter URLs omit it entirely.
const buildStamp=__BUILD_STAMP__;
import {formatBuildStamp} from './format.js';
import {node} from '../ui/kit/dom.js';
export function createBuildBadge(container){
  const element=node('small','build-badge',formatBuildStamp(buildStamp));
  if(new URLSearchParams(location.search).get('demo')!=='1')container.append(element);
  return {dispose(){element.remove();}};
}
