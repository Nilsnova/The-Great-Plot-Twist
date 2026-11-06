// Vite's build-only identity plugin. Labels become HTML/CSS, never executable inline code.
import {formatBuildStamp} from '../src/build/format.js';
const styleId = '\0build-identity.css';

export function createBuildIdentityPlugin(stamp) {
  const label = formatBuildStamp(stamp);
  return {
    name: 'public-build-stamp',
    resolveId(id) { if (id === 'virtual:build-identity.css') return styleId; },
    load(id) { if (id === styleId) return `:root{--build-label:${JSON.stringify(label)}}`; },
    transformIndexHtml(html) { return html.replace('BUILD_STAMP_TEXT', label); },
    generateBundle() {
      this.emitFile({type: 'asset', fileName: 'build-stamp.json', source: JSON.stringify(stamp) + '\n'});
    },
  };
}
