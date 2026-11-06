// Only start.sh selects this configuration. Never load .env or modify the production client.
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../frontend/', import.meta.url));
const sessionScript = fileURLToPath(new URL('./session.js', import.meta.url));
export default ({ command, isPreview }) => {
  if (command !== 'serve' || isPreview) throw new Error('G22 local sign-in is serve-only. Use the normal frontend configuration for builds.');
  if (!/^\d+$/.test(process.env.G22_API_PORT ?? '') || Number(process.env.G22_API_PORT) < 1 || Number(process.env.G22_API_PORT) > 65535) throw new Error('Choose an explicit local API port.');
  return {
    root,
    envDir: false,
    server: {
      host: '127.0.0.1',
      strictPort: true,
      fs: {allow: [fileURLToPath(new URL('../../', import.meta.url))]},
      proxy: {'/api': `http://127.0.0.1:${process.env.G22_API_PORT}`},
    },
    plugins: [{
      name: 'g22-local-sign-in',
      apply: 'serve',
      transformIndexHtml() {
        return [{tag: 'script', attrs: {type: 'module', src: `/@fs/${sessionScript}`},
          injectTo: 'body'}];
      },
    }],
  };
};
