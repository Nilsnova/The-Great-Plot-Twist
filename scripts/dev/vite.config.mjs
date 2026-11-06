// Only start.sh selects this configuration. Never load .env or modify the production client.
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../frontend/', import.meta.url));
const sessionScript = fileURLToPath(new URL('./session.js', import.meta.url));
export default {
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
    transformIndexHtml() {
      return [{tag: 'script', attrs: {type: 'module', src: `/@fs/${sessionScript}`},
        injectTo: 'body'}];
    },
  }],
};
