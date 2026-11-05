// Logic of the sign-in check page (auth-check.html). A team check page, not the game.
//
// What it proves, in five steps:
//   1. It asks our server how to sign in (GET /api/config gives the Supabase address).
//   2. "Sign in with GitHub": the page makes a secret and its fingerprint (auth-check-pkce.js), keeps
//      the secret in this tab and sends the browser to Supabase with the fingerprint. Supabase asks
//      GitHub.
//   3. Supabase sends the browser back to this page with a ONE-TIME CODE in the address (?code=...).
//   4. The page gives the code and the secret to our server (POST /api/auth/exchange). The server
//      swaps them with Supabase for a login token and sends the token back.
//   5. The page shows the token to our server (GET /api/me) and prints who the server says you are.
//
// Safety rules this file follows:
//   - The address never holds a login token. It holds a one-time code. The code works once, for 5
//     minutes, and only together with the secret in this tab. The page removes it from the address
//     at once.
//   - The login token lives in one variable: in memory only. It is never saved (no localStorage, no
//     cookie), never written to the console and never shown on the page.
//   - The refresh token and GitHub's own token never reach the browser. Our server keeps them out.
//   - Reload the page and the token is gone. That is on purpose.
//
// The calls to our server are in auth-check-api.js, the secret in auth-check-pkce.js.
// Plain JavaScript, no framework, no build step. Used by: auth-check.html.

import { askServerWhoIAm, errorMessage, exchangeCodeForToken, loadSignInConfig } from './auth-check-api.js';
import { makeChallenge, makeVerifier, saveVerifier, takeVerifier } from './auth-check-pkce.js';

// The address Supabase sends the browser back to after the GitHub sign-in.
const CHECK_PAGE = '/auth-check.html';

const statusLine = document.getElementById('status');
const signInButton = document.getElementById('sign-in');
const forgetButton = document.getElementById('forget');

// The login token. Memory only: never copy it anywhere else.
let token = null;
// How to sign in, as our server told us: { provider, supabaseUrl }. Null while we do not know.
let signInConfig = null;

// textContent puts plain text on the page. It can never run HTML, whatever the text holds.
function say(text) {
  statusLine.textContent = text;
}

// Show the sign-in button only while we hold no token. Show "Forget me" only while we hold one.
function updateButtons() {
  signInButton.hidden = !(signInConfig !== null && token === null);
  forgetButton.hidden = token === null;
}

// Step 2. Make the secret and its fingerprint, keep the secret in this tab, then go to Supabase.
async function startSignIn() {
  try {
    const verifier = makeVerifier();
    const challenge = await makeChallenge(verifier);
    if (!saveVerifier(verifier)) {
      say('This browser does not let the page keep the sign-in secret. Try another browser.');
      return;
    }
    const query = new URLSearchParams({
      provider: signInConfig.provider,
      redirect_to: location.origin + CHECK_PAGE,
      code_challenge: challenge,
      code_challenge_method: 's256',
    });
    location.assign(`${signInConfig.supabaseUrl}/auth/v1/authorize?${query}`);
  } catch {
    // The browser makes the fingerprint only on https addresses (and on localhost).
    say('This browser cannot make a safe sign-in here. Open the page on its https address.');
  }
}

// Step 3. Read what Supabase put in the address, then remove it from there right away.
function takeAnswerFromAddress() {
  if (location.search === '' && location.hash === '') return { code: null, failed: false };
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  // Read first, then clean: after this line the "?..." and "#..." parts are gone from the address.
  history.replaceState(null, '', location.pathname);
  // This page reads the one-time code and nothing else. A GitHub error comes back as "error=...".
  return { code: query.get('code') || null, failed: query.has('error') || fragment.has('error') };
}

function describeMe(me) {
  const crewCount = Array.isArray(me.crews) ? me.crews.length : 0;
  return `Signed in as ${me.displayName}, coins ${me.coins}, crews ${crewCount}`;
}

async function checkLogin() {
  say('Asking the server who you are...');
  let answer;
  try {
    answer = await askServerWhoIAm(token);
  } catch {
    say('Could not reach the server. Try again in a moment.');
    return;
  }

  if (answer.status === 200 && answer.body) {
    say(describeMe(answer.body));
  } else if (answer.status === 401) {
    token = null; // the server did not accept it, so there is no use in keeping it
    say('The server did not accept your login. Press the button to sign in again.');
  } else {
    say(`The server answered ${answer.status}. ${errorMessage(answer.body)}`);
  }
}

// Steps 4 and 5, after Supabase sent the browser back with a one-time code.
async function finishSignIn(code) {
  const codeVerifier = takeVerifier(); // the secret from step 2. It works once, so it is deleted now.
  if (codeVerifier === null) {
    say('This sign-in link does not work any more. It works once, in the tab where you pressed the button. Press the button to sign in again.');
    return;
  }

  say('Finishing the sign-in...');
  let answer;
  try {
    answer = await exchangeCodeForToken(code, codeVerifier);
  } catch {
    say('Could not reach the server. Try again in a moment.');
    return;
  }

  if (answer.status === 200 && answer.body && typeof answer.body.accessToken === 'string') {
    token = answer.body.accessToken;
    await checkLogin();
  } else if (answer.status === 401) {
    say('The server did not accept your sign-in code. Press the button to sign in again.');
  } else {
    say(`The server answered ${answer.status}. ${errorMessage(answer.body)}`);
  }
}

function forgetMe() {
  token = null;
  takeVerifier(); // also throw away a secret that may still be waiting in this tab
  say('Forgotten. This page no longer holds your login token. Press the button to sign in again.');
  updateButtons();
}

async function start() {
  const answer = takeAnswerFromAddress(); // first of all: it removes the code from the address
  forgetButton.addEventListener('click', forgetMe);
  signInButton.addEventListener('click', startSignIn);
  signInConfig = await loadSignInConfig();

  if (answer.code !== null) {
    await finishSignIn(answer.code);
  } else if (answer.failed) {
    say('GitHub sign-in did not finish. Press the button to try again.');
  } else if (signInConfig !== null) {
    say('Not signed in. Press the button to sign in with GitHub.');
  } else {
    say('Sign-in is not set up on this server yet, or the server cannot be reached.');
  }
  updateButtons();
}

start();
