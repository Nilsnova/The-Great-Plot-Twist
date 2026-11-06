// Local manifests support QA; production exposes only game and approved galleries.
import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export const previewSecurityHeaders={
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
 'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
};
export default defineConfig({
 base:'./',server:{proxy:{'/api':'http://127.0.0.1:8000'}},
 preview:{proxy:{'/api':'http://127.0.0.1:8000'},headers:previewSecurityHeaders},
 build:{manifest:!process.env.VERCEL,rolldownOptions:{input:{
  game:resolve(import.meta.dirname,'index.html'),workshop:resolve(import.meta.dirname,'asset-library.html'),uiKit:resolve(import.meta.dirname,'ui-kit.html'),
  host:resolve(import.meta.dirname,'host.html'),
  ...(process.env.CASE_LAB==='1'?{caseLab:resolve(import.meta.dirname,'case-lab.html')}:{}),
 }}},test:{include:['tests/**/*.test.js']},
});
