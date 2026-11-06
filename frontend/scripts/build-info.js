// Public deployment identity and complete emitted bundle list. Used only by Vite builds.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function buildInfoPlugin(options={}) {
  return {name:'public-build-info',apply:'build',generateBundle:{order:'post',handler(_output,bundle) {
    // Vercel supplies public Git metadata even when its build checkout has no .git directory.
    const commit=options.commit??process.env.VERCEL_GIT_COMMIT_SHA??execFileSync('git',['rev-parse','HEAD'],{
      cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8',
    }).trim();
    if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('A full Git commit is required for build-info.json');
    const assets=Object.values(bundle).map(file=>file.fileName).filter(file=>/\.(js|css)$/.test(file)).sort();
    this.emitFile({type:'asset',fileName:'build-info.json',source:JSON.stringify({
      commit,builtAt:options.builtAt??new Date().toISOString(),assets,
    })+'\n'});
  }}};
}
