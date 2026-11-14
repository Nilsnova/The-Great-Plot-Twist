// Runs the two GitHub sign-in checks in order: the PKCE login/logout round trip, then the
// live sign-in flag gate. Both scripts only export a function, so `node scripts/check-online-auth.js`
// on its own checks nothing and exits 0.
// Run with `npm run test:signin` from frontend/. Exits 1 on the first failure.
import {checkOnlineAuth} from './check-online-auth.js';
import {checkOnlineSignInGate} from './check-online-signin-gate.js';

const checks = [['check-online-auth', checkOnlineAuth], ['check-online-signin-gate', checkOnlineSignInGate]];
let failed = false;
for (const [name, run] of checks) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${name}: ${error?.stack ?? error}`);
    break;
  }
}
process.exit(failed ? 1 : 0);
