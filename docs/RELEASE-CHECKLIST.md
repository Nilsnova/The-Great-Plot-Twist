# Release and submission checklist

Used by the release owner and Moodle backup. Run commands from the repository root unless stated otherwise. These are actions to perform, not claims that production or Moodle has already passed. Keep private settings, login responses and case solutions off the projector.

## Every release candidate

1. **Freeze and record the candidate.** Bring the task branch up to date, run the gates, obtain an independent agent review, and let Claude integrate under D015. Do not push `main` from a feature task.

   ```bash
   git fetch origin main
   git merge --no-edit origin/main
   git rev-parse HEAD
   git status --short
   ```

2. **Fresh checkout, locked installation, tests, style, build and spoiler guard.** Default checks published `main`; argument two selects another branch/tag. Exit status is the number of failed steps, including steps blocked by a prerequisite. Failed-run logs remain under the printed temporary directory.

   ```bash
   bash scripts/fresh-clone-check.sh
   # Before integration, after the branch is pushed:
   bash scripts/fresh-clone-check.sh https://github.com/Nilsnova/The-Great-Plot-Twist.git docs/g11-ship-pack
   ```

   Requires Git, uv, compatible Node and npm. Only clone, `uv sync` and `npm ci` download; the remaining checks use installed tools. No browser or live database check is included. In a sandbox with read-only home caches, export `UV_CACHE_DIR=/workspace/.cache/uv` and `npm_config_cache=/workspace/.cache/npm` first.

3. **Local production browser smoke.** From `frontend/` in the candidate checkout, after installing:

   ```bash
   CHROME_PATH=/usr/bin/chromium CAPTURE_PREFIX=Release-Candidate npm run test:production
   ```

   Substitute the installed Chrome/Chromium path. Use a unique capture prefix and preserve historical evidence. This exercises the local build with deterministic fixtures, not the deployed service.

4. **Signed-out live smoke.** Open these exact addresses in a new private browser window:

   ```text
   https://the-great-plot-twist.vercel.app/
   https://the-great-plot-twist.vercel.app/?demo=1
   https://the-great-plot-twist.vercel.app/api/health
   ```

   Check title, Credits, readable controls, New game/intro, movement, chart travel, sound after a click, and health `status: ok`. Use the [presenter script](PRESENTER-SCRIPT.md) for **Highlights tour**, **Next beat · Space** and **End rehearsal**; stop at the schooner. Inspect Console/Network. Record browser/version/date/result and deployed revision. The audited main lacks integrated game sign-in and an online case adapter: mark unavailable capabilities honestly. There is no terminal command that substitutes for this manual UI check.

5. **Live bundle spoiler scan and deployment match.** Build the exact candidate locally, then run this from `frontend/`. It downloads all built public text paths, including lazy chunks, compares bytes and checks protected fingerprints. No protected text is printed. A different or missing file blocks release until the deployed revision is identified.

   ```bash
   npm run build
   node --input-type=module <<'JS'
   import {readFile,readdir} from 'node:fs/promises';
   import {join,relative} from 'node:path';
   import {createHash} from 'node:crypto';
   import {containsFingerprint} from './scripts/spoiler-guard.js';
   const base='https://the-great-plot-twist.vercel.app/';
   const {fingerprints}=JSON.parse(await readFile('tests/fixtures/reveal-fingerprints.json','utf8'));
   async function collect(dir) {
     const result=[];
     for(const e of await readdir(dir,{withFileTypes:true})) {
       if(e.name.startsWith('.')) continue;
       const p=join(dir,e.name);
       if(e.isDirectory()) result.push(...await collect(p));
       else if(/\.(html|js|css|json|map)$/.test(e.name)) result.push(p);
     }
     return result;
   }
   const files=await collect('dist');
   if(!files.length) throw new Error('No built text files');
   const hash=b=>createHash('sha256').update(b).digest('hex');
   for(const path of files) {
     const name=relative('dist',path).split('/').map(encodeURIComponent).join('/');
     const response=await fetch(new URL(name,base),{signal:AbortSignal.timeout(30000)});
     if(!response.ok) throw new Error(`HTTP ${response.status}: ${name}`);
     const body=Buffer.from(await response.arrayBuffer());
     if(fingerprints.some(f=>containsFingerprint(body.toString('utf8'),f)))
       throw new Error(`Protected sentence in ${name}`);
     if(hash(body)!==hash(await readFile(path))) throw new Error(`Deployment mismatch: ${name}`);
   }
   console.log(`PASS ${files.length} live text files match this build and pass fingerprints`);
   JS
   ```

   This scans the fixture's exact protected sentences, not every possible paraphrase or identity leak. Manually inspect public-content/source-map changes without copying solution text into evidence. It checks local public build paths, not arbitrary extra server files.

6. **Headers and routing.** Require successful GETs, correct HTML/JSON content types and the expected security/cache behavior from `vercel.json` and route contracts. Record absent expected headers; commands do not add them.

   ```bash
   curl --fail --show-error --silent -I https://the-great-plot-twist.vercel.app/
   curl --fail --show-error --silent -I https://the-great-plot-twist.vercel.app/api/health
   curl --fail --show-error --silent -D - -o /dev/null https://the-great-plot-twist.vercel.app/api/content/intro-story
   ```

   A GET-only FastAPI route may return 405 to HEAD. Record that separately and use this GET-header fallback to check health:

   ```bash
   curl --fail --show-error --silent -D - -o /dev/null https://the-great-plot-twist.vercel.app/api/health
   ```

## Sunday 22 November 2026: demo readiness

- Open the team's Supabase project dashboard; check that it is active and resume it there if paused. Never copy its private configuration into these docs.
- Check the daily keep-alive. It is scheduled for 06:17 UTC and should report a 200. With an already authenticated GitHub CLI:

  ```bash
  gh run list --repo Nilsnova/The-Great-Plot-Twist --workflow keepalive.yml --limit 5
  # Replace RUN_ID with the latest scheduled run's numeric ID:
  gh run view RUN_ID --repo Nilsnova/The-Great-Plot-Twist
  ```

  CLI authentication is separate from Git access. Otherwise use **Actions → Keep Supabase awake → latest run**. Do not recreate credentials or add Vercel Cron.
- Rehearse on the presentation laptop: sound on, 100% zoom, keyboard focus, responsiveness, local recording fallback and schooner stop. `record=1` and `perf=1` are unimplemented on audited main; they do not prove recording/FPS readiness.
- Nils checks the public-name inventory in the [script](PRESENTER-SCRIPT.md). Confirm complete credits from `frontend/src/shell/team.js` when supplied; current Credits still uses placeholders. Resolve this before submission.

## Monday 23 November 2026: submission

1. Rerun all release checks on the final SHA. Complete explain-back and Nils's final/ad-hoc review under D015. Keep evidence and the presenter recording locally, outside source history.
2. **Release owner only, after checks/integration:** tag the verified `origin/main` commit. Never move an existing tag. Run the sequence in a separate Bash subshell so a failed guard stops it. This is a future release action, not authority for G11 to push a tag or `main`.

   ```bash
   (
     set -e
     git fetch origin main
     if git show-ref --verify --quiet refs/tags/v1.0; then
       echo 'STOP: local v1.0 already exists'; exit 1
     fi
     remote_tag=$(git ls-remote --tags origin refs/tags/v1.0)
     if [ -n "$remote_tag" ]; then
       echo 'STOP: remote v1.0 already exists'; exit 1
     fi
     git tag -a v1.0 origin/main -m 'The Great Plot Twist course release'
     git push origin refs/tags/v1.0
   )
   ```

3. **Moodle source archive:** archive the tag, excluding environments/private local files/caches by construction. Verify tracked contents before uploading; Git history being public is not proof of a clean archive.

   ```bash
   mkdir -p ../submission
   git archive --format=zip --prefix=The-Great-Plot-Twist/ --output=../submission/The-Great-Plot-Twist-v1.0.zip v1.0
   sha256sum ../submission/The-Great-Plot-Twist-v1.0.zip > ../submission/The-Great-Plot-Twist-v1.0.sha256
   git rev-parse 'v1.0^{commit}'
   ```

4. **Moodle uploader:** designated teammate opens the course assignment → **Add submission/Edit submission** → uploads the archive and any separately required course material → saves → presses **Submit assignment** if offered → verifies submitted status and receipt. There is no repository Moodle CLI. Confirm the actual deadline, file limits and attachments in Moodle; this repo does not establish them. Keep course-only identity information outside this public repo.
5. **Named backup uploader: Nils.** The designated uploader privately shares the SHA, checksum and receipt with Nils. If the uploader cannot submit, Nils uses the same verified archive and confirms receipt. Check Moodle's group-submission rules and avoid competing uploads.

## Gaps to recheck after integration

- `frontend/src/shell/team.js` and `frontend/HOW-IT-WORKS.md` are absent; Credits remains placeholders.
- `?demo=1` works; `?demo=1&record=1` behaves like demo alone; `?perf=1` adds no production FPS display.
- The built-in tour continues beyond the schooner. Stop manually, or use only the three approved individual coastal visuals.
- Old setup prose still calls the existing Vite API proxy unfinished. D015's later agent-work exception differs from older general review prose.
- Online case screens, live trading UI and later live-system features are incompletely wired or absent. Isolated API tests do not establish live multiplayer.
